import React, { useEffect, useState } from "react";
import ScreenSpaceEventHandler from "terriajs-cesium/Source/Core/ScreenSpaceEventHandler";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import Cesium from "../../../Models/Cesium";

type PropsType = { cesium: Cesium; onPosition: () => void };

const CapturePosition: React.FC<PropsType> = ({ cesium }) => {
  useEffect(() => {
    const eventHandler = new ScreenSpaceEventHandler(cesium.scene.canvas);
    const capture = () => {};
    const moveTooltip = () => {};
    eventHandler.setInputAction(console.log, ScreenSpaceEventType.LEFT_CLICK);
    return () => eventHandler.destroy();
  });
  return <></>;
};

export default CapturePosition;
