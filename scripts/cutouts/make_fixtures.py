#!/usr/bin/env python3
"""Regenerates the tiny stand-in models in fixtures/ (`pip install onnx numpy`, then `python scripts/cutouts/make_fixtures.py`).

They let the tests run the whole cut-out pipeline in a second with nothing downloaded. They are NOT real models; each does the
simplest thing that lets a test tell whether the pipeline did its job. All three are made for one test picture: 1280x720,
dark grey with a bright (white) rectangle at x 400-700, y 200-650, the "person".

  tiny-people.onnx   a YOLOX-shaped output (1, 8400, 85) that holds one person box round the rectangle with a confidence
                     that depends on the picture: full where the rectangle's pixels are bright, none where they are dark.
                     So it finds the "person" in the picture and, in a plate where the "person" was painted out, finds nobody.
  tiny-matte.onnx    a matte that is 1 where the picture is bright and 0 where it is dark (a BiRefNet-shaped 1024x1024 in/out).
  tiny-lama.onnx     LaMa's two inputs (image 0..1, mask) and an answer 0..255 that is black where the mask is set: the plate's
                     hole, so a test can see it was the model that filled it.
"""
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
OPSET = [helper.make_opsetid("", 13)]


def save(graph, name):
    model = helper.make_model(graph, opset_imports=OPSET)
    model.ir_version = 7
    onnx.checker.check_model(model)
    onnx.save(model, os.path.join(HERE, name))
    print(name, os.path.getsize(os.path.join(HERE, name)), "bytes")


def const(name, array):
    return numpy_helper.from_array(np.asarray(array), name)


def people():
    # The rectangle (x 400-700, y 200-650 of a 1280x720 picture) in the model's 640x640 letterboxed input is x 200-350, y 100-325.
    cx, cy, w, h = 275.0, 212.5, 150.0, 225.0
    gx, gy, stride = int(cx // 8), int(cy // 8), 8
    anchor = gy * 80 + gx  # the first (stride 8) level is 80 x 80
    head = np.array([cx / stride - gx, cy / stride - gy, np.log(w / stride), np.log(h / stride)], np.float32)
    tail = np.zeros(80, np.float32)
    tail[0] = 0.99  # the "person" class
    nodes = [
        helper.make_node("Slice", ["images", "starts", "ends", "axes"], ["patch"]),
        helper.make_node("ReduceMax", ["patch"], ["brightest"], keepdims=0),
        helper.make_node("Sub", ["brightest", "low"], ["above"]),
        helper.make_node("Div", ["above", "span"], ["ratio"]),
        helper.make_node("Clip", ["ratio", "zero", "one"], ["obj_scalar"]),
        helper.make_node("Reshape", ["obj_scalar", "shape1"], ["obj"]),
        helper.make_node("Concat", ["head", "obj", "tail"], ["row"], axis=0),
        helper.make_node("Reshape", ["row", "shape_row"], ["updates"]),
        helper.make_node("ConstantOfShape", ["out_shape"], ["zeros"], value=numpy_helper.from_array(np.zeros(1, np.float32))),
        helper.make_node("ScatterND", ["zeros", "index", "updates"], ["output"]),
    ]
    inits = [
        const("starts", np.array([0, 0, 100, 200], np.int64)),
        const("ends", np.array([1, 3, 325, 350], np.int64)),
        const("axes", np.array([0, 1, 2, 3], np.int64)),
        const("low", np.float32(200.0)),
        const("span", np.float32(55.0)),
        const("zero", np.float32(0.0)),
        const("one", np.float32(1.0)),
        const("shape1", np.array([1], np.int64)),
        const("head", head),
        const("tail", tail),
        const("shape_row", np.array([1, 85], np.int64)),
        const("out_shape", np.array([1, 8400, 85], np.int64)),
        const("index", np.array([[0, anchor]], np.int64)),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny_people",
        [helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 8400, 85])],
        inits,
    )
    save(graph, "tiny-people.onnx")


def matte():
    # input is ImageNet-normalised: bright pixels are about +2, dark ones about -1.5; the mean over the channels, minus 0.5, times 12
    nodes = [
        helper.make_node("ReduceMean", ["input_image"], ["mean"], axes=[1], keepdims=1),
        helper.make_node("Sub", ["mean", "half"], ["shifted"]),
        helper.make_node("Mul", ["shifted", "gain"], ["output_image"]),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny_matte",
        [helper.make_tensor_value_info("input_image", TensorProto.FLOAT, [1, 3, 1024, 1024])],
        [helper.make_tensor_value_info("output_image", TensorProto.FLOAT, [1, 1, 1024, 1024])],
        [const("half", np.float32(0.5)), const("gain", np.float32(12.0))],
    )
    save(graph, "tiny-matte.onnx")


def lama():
    nodes = [
        helper.make_node("Greater", ["mask", "half"], ["hole"]),
        helper.make_node("Mul", ["image", "scale"], ["scaled"]),
        helper.make_node("Where", ["hole", "black", "scaled"], ["output"]),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny_lama",
        [
            helper.make_tensor_value_info("image", TensorProto.FLOAT, [1, 3, 512, 512]),
            helper.make_tensor_value_info("mask", TensorProto.FLOAT, [1, 1, 512, 512]),
        ],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 3, 512, 512])],
        [const("half", np.float32(0.5)), const("scale", np.float32(255.0)), const("black", np.float32(0.0))],
    )
    save(graph, "tiny-lama.onnx")


if __name__ == "__main__":
    os.makedirs(HERE, exist_ok=True)
    people()
    matte()
    lama()
