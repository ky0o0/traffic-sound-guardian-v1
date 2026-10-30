"""New host-side streaming adapter for the pinned, UNMODIFIED official SH Net.

Only 13 new latent frames (416 samples) are processed per full step. 32 samples
of raw lookbehind and 32 of raw lookahead bridge the official 96-tap input conv.
Encoder, decoder and output buffers are passed through the official public API.
There is no overlapping full-window re-inference or network parameter change.
"""
from dataclasses import dataclass
import math
import time
import numpy as np
import torch


@dataclass
class Emission:
    start_sample: int
    samples: np.ndarray
    trace: dict


class StatefulHearing:
    def __init__(self, model, label, *, reset_each_block=False,
                 reset_schedule=None, paced_origin=None):
        self.model = model
        self.label = label
        self.L = int(model.L)
        self.frames = int(model.mask_gen.decoder.chunk_size)
        self.block = self.L * self.frames
        if not model.lookahead or model.in_conv[0].kernel_size != (3*self.L,):
            raise ValueError('Adapter audited only for official lookahead input conv')
        if model.training:
            raise ValueError('Model must be in eval mode')
        self.device = next(model.parameters()).device
        self.reset_each_block = reset_each_block
        self.reset_schedule = dict(reset_schedule or {})
        for sample, names in self.reset_schedule.items():
            if sample < 0 or sample % self.block:
                raise ValueError('Resets must use actual aligned output-block starts')
            if not set(names) <= {'encoder','decoder','output'}:
                raise ValueError('Unknown neural state component')
        self.state = model.init_buffers(1, self.device)
        self.buffer = np.zeros((self.L, 2), dtype='float32')
        self.received = 0
        self.emitted = 0
        self.closed = False
        self.traces = []
        self.reset_log = []
        self.paced_origin = paced_origin
        self.virtual_finish = 0.

    def reset_neural_state(self, names=('encoder','decoder','output')):
        """Reset only audited neural buffers; retain real raw-convolution context."""
        zero = self.model.init_buffers(1, self.device)
        order = ('encoder','decoder','output')
        self.state = tuple(zero[i] if name in names else self.state[i]
                           for i,name in enumerate(order))
        self.reset_log.append(dict(output_sample=self.emitted, components=list(names),
                                   raw_context_retained=True))

    def snapshot(self):
        return dict(state=tuple(t.clone() for t in self.state),
                    buffer=self.buffer.copy(),received=self.received,
                    emitted=self.emitted,closed=self.closed,
                    virtual_finish=self.virtual_finish)

    def restore(self, checkpoint):
        if checkpoint['emitted'] > checkpoint['received']:
            raise ValueError('Invalid stream checkpoint')
        self.state = tuple(t.clone() for t in checkpoint['state'])
        self.buffer = checkpoint['buffer'].copy()
        self.received = checkpoint['received']
        self.emitted = checkpoint['emitted']
        self.closed = checkpoint['closed']
        self.virtual_finish = checkpoint['virtual_finish']

    def _step(self, frames, valid, eof=False):
        wall_started = time.perf_counter()
        resets = []
        if self.reset_each_block and self.emitted > 0:
            resets = ['encoder','decoder','output']
        if self.emitted in self.reset_schedule:
            resets = self.reset_schedule[self.emitted]
        if resets:
            self.reset_neural_state(resets)
        need = frames*self.L + 2*self.L
        raw = self.buffer[:need]
        right_zeros = max(0,need-len(raw))
        if right_zeros:
            if not eof:
                raise RuntimeError('Attempt to use unavailable future audio')
            raw = np.pad(raw,((0,right_zeros),(0,0)))
        tensor = torch.from_numpy(np.ascontiguousarray(raw.T)).unsqueeze(0).to(self.device)
        forward_started = time.perf_counter()
        with torch.inference_mode():
            result, enc, dec, out = self.model(
                {'mixture':tensor,'label_vector':self.label},
                init_enc_buf=self.state[0],init_dec_buf=self.state[1],
                init_out_buf=self.state[2],pad=False)
        if self.device.type != 'cpu':
            raise RuntimeError('Timing protocol currently supports CPU only')
        forward_seconds = time.perf_counter()-forward_started
        self.state = (enc,dec,out)
        y = result['x'].squeeze(0).cpu().numpy().T.copy()
        if y.shape != (frames*self.L,2) or not np.isfinite(y).all():
            raise RuntimeError('Invalid official stateful output shape or samples')
        y = y[:valid]
        start = self.emitted
        self.buffer = self.buffer[frames*self.L:].copy()
        self.emitted += valid
        step_seconds = time.perf_counter()-wall_started
        # Serial-service estimate driven by MEASURED CPU work, not a device latency.
        arrival_seconds = self.received/44100
        queue_wait = max(0., self.virtual_finish-arrival_seconds)
        self.virtual_finish = max(self.virtual_finish,arrival_seconds)+step_seconds
        trace = dict(index=len(self.traces),start_sample=start,
                     end_sample=self.emitted,input_received_sample=self.received,
                     mathematical_required_sample=start+frames*self.L+self.L,
                     actual_lookahead_samples=self.received-self.emitted,
                     forward_seconds=forward_seconds,step_seconds=step_seconds,
                     modeled_available_seconds=self.virtual_finish,
                     modeled_queue_wait_seconds=queue_wait,
                     raw_input_start_sample=start-self.L,
                     raw_input_end_sample=start+frames*self.L+self.L,
                     actual_available_seconds=(time.perf_counter()-self.paced_origin)
                     if self.paced_origin is not None else None,
                     eof=eof,eof_zero_padding_samples=right_zeros,
                     reset_components=resets)
        self.traces.append(trace)
        return Emission(start,y,trace)

    def push(self, samples, *, start_sample=None):
        if self.closed:
            raise RuntimeError('Cannot push after EOF')
        if start_sample is not None and start_sample != self.received:
            raise ValueError('Packets must be contiguous and in chronological order')
        x = np.asarray(samples,dtype='float32')
        if x.ndim != 2 or x.shape[1] != 2 or not len(x) or not np.isfinite(x).all():
            raise ValueError('Requires nonempty, finite, two-channel samples')
        self.buffer = np.concatenate((self.buffer,x))
        self.received += len(x)
        outputs = []
        while self.received >= self.emitted+self.block+self.L:
            outputs.append(self._step(self.frames,self.block))
        return outputs

    def flush(self):
        if self.closed:
            raise RuntimeError('EOF already flushed')
        outputs=[]
        while self.emitted < self.received:
            remaining=self.received-self.emitted
            frames=min(self.frames,math.ceil(remaining/self.L))
            outputs.append(self._step(frames,min(remaining,frames*self.L),eof=True))
        self.closed=True
        return outputs


def run_stream(model,label,x,*,packet_samples=32,reset_each_block=False,
               reset_schedule=None,paced=False):
    origin=time.perf_counter() if paced else None
    adapter=StatefulHearing(model,label,reset_each_block=reset_each_block,
                            reset_schedule=reset_schedule,paced_origin=origin)
    emissions=[];lateness=[];started=time.perf_counter()
    for pos in range(0,len(x),packet_samples):
        packet=x[pos:pos+packet_samples]
        if paced:
            deadline=origin+(pos+len(packet))/44100
            delay=deadline-time.perf_counter()
            if delay>0:time.sleep(delay)
            lateness.append(max(0.,time.perf_counter()-deadline))
        emissions.extend(adapter.push(packet,start_sample=pos))
    emissions.extend(adapter.flush())
    elapsed=time.perf_counter()-started
    y=np.concatenate([e.samples for e in emissions]) if emissions else np.empty((0,2))
    if y.shape != x.shape or [e.start_sample for e in emissions] != [0]+[e.trace['end_sample'] for e in emissions[:-1]]:
        raise RuntimeError('Stream output concatenation/timestamps are invalid')
    return y,dict(traces=adapter.traces,resets=adapter.reset_log,
                  wall_seconds=elapsed,packet_samples=packet_samples,
                  packet_lateness_seconds=lateness,
                  neural_state_bytes=sum(t.numel()*t.element_size() for t in adapter.state),
                  raw_buffer_samples=len(adapter.buffer),paced=paced)
