"""Use the saved research encoder + trained head on an actual WAV; no website edits."""
import argparse
import json
import math
import pathlib
import numpy as np
import soundfile as sf
import tensorflow as tf
from experiment import resample_window

parser=argparse.ArgumentParser();parser.add_argument('model_directory');parser.add_argument('audio_file');args=parser.parse_args()
root=pathlib.Path(args.model_directory);selection=json.loads((root/'selection-locked-before-test.json').read_text())
encoder=tf.lite.Interpreter(model_path=str(root/'yamnet_features.tflite'),num_threads=2);encoder.allocate_tensors()
head=tf.lite.Interpreter(model_path=str(root/'bicycle_bell_head.tflite'),num_threads=1);head.allocate_tensors()
feature=next(x for x in encoder.get_output_details() if x['shape'].tolist()==[1,1,1,1024]);scale,zero=feature['quantization']
audio,rate=sf.read(args.audio_file,dtype='float32',always_2d=True);audio=audio.mean(axis=1,dtype=np.float32)
size=math.floor(rate*.975);hop=round(rate*selection['hop_seconds']);kernels={}
if len(audio)<size:audio=np.pad(audio,(0,size-len(audio)))
for start in range(0,len(audio)-size+1,hop):
    encoder.set_tensor(0,resample_window(audio[start:start+size],rate,kernels));encoder.invoke()
    embedding=(encoder.get_tensor(feature['index']).reshape(1,-1).astype(np.float32)-zero)*scale
    head.set_tensor(head.get_input_details()[0]['index'],embedding);head.invoke();score=float(head.get_tensor(head.get_output_details()[0]['index'])[0,0])
    print(json.dumps({'window_end_seconds':(start+size)/rate,'score':score,'bicycle_bell':score>=selection['threshold']}))
