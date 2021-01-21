import React, { useEffect } from "react";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import EllipsoidTerrainProvider from "terriajs-cesium/Source/Core/EllipsoidTerrainProvider";
import sampleTerrainMostDetailed from "terriajs-cesium/Source/Core/sampleTerrainMostDetailed";
import ScreenSpaceEventHandler from "terriajs-cesium/Source/Core/ScreenSpaceEventHandler";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import Camera from "terriajs-cesium/Source/Scene/Camera";
import Cesium from "../../../Models/Cesium";

/**
 * TODOs:
 * - extract the fly to ground action to a reusable standalone function.
 */

type DropPedestrianProps = {
  cesium: Cesium;
  afterDrop: (position: any) => void;
};

const DropPedestrian: React.FC<DropPedestrianProps> = ({
  cesium,
  afterDrop
}) => {
  useEffect(() => {
    const scene = cesium.scene;
    const eventHandler = new ScreenSpaceEventHandler(scene.canvas);

    const dropPedestrian = async ({ position }: { position: Cartesian2 }) => {
      //scene.screenSpaceCameraController.enableCollisionDetection = false;
      const pickRay = scene.camera.getPickRay(position);
      const pickPosition = scene.globe.pick(pickRay, scene);
      //const pickPosition = scene.pickPosition(position);
      if (pickPosition) {
        //const droppedPosition = setHeightFromTerrain(pickPosition, 1.5);
        const cartographic = Cartographic.fromCartesian(pickPosition);
        const terrainProvider = scene.terrainProvider;
        let preciseCartographic: Cartographic;
        if (
          terrainProvider === undefined ||
          terrainProvider instanceof EllipsoidTerrainProvider
        ) {
          preciseCartographic = cartographic;
          preciseCartographic.height = Math.max(0, preciseCartographic.height);
        } else {
          [
            preciseCartographic
          ] = await sampleTerrainMostDetailed(terrainProvider, [cartographic]);
        }

        console.log("*height*", preciseCartographic.height);
        const droppedPosition = Cartographic.toCartesian(preciseCartographic);
        /* const direction = Cartesian3.subtract(
         *   pickPosition,
         *   droppedPosition,
         *   new Cartesian3()
         * );
         * const up = Cartesian3.UNIT_Z.clone();
         * console.log(direction, up); */
        flyTo(droppedPosition, {}, scene.camera).then(() => {
          scene.requestRender();
          afterDrop(droppedPosition);
        });
        scene.requestRender();
      }
    };

    const moveMouseTooltip = (ev: MouseEvent) => {
      const position = new Cartesian2(ev.x, ev.y);
      const pickRay = scene.camera.getPickRay(position);
      const dropPosition = scene.globe.pick(pickRay, scene);
      console.log(
        scene.pickPosition(position),
        Cartographic.fromCartesian(scene.pickPosition(position))
        /* Cartographic.fromCartesian(dropPosition!),
         * Cartographic.fromCartesian(scene.pickPosition(position)) */
      );
    };

    eventHandler.setInputAction(
      dropPedestrian,
      ScreenSpaceEventType.LEFT_CLICK
    );
    window.addEventListener("mousemove", moveMouseTooltip);
    return () => {
      eventHandler.destroy();
      window.removeEventListener("mousemove", moveMouseTooltip);
    };
  });
  return <></>;
};

function flyTo(
  destination: Cartesian3,
  orientation: any,
  camera: Camera
): Promise<void> {
  return new Promise(resolve =>
    camera.flyTo({
      duration: 3,
      destination,
      orientation: { heading: 0, pitch: 0, roll: 0 },
      complete: () => resolve()
    })
  );
}

function setHeightFromTerrain(
  cartesian: Cartesian3,
  heightInMetres: number
): Cartesian3 {
  const carto = Cartographic.fromCartesian(cartesian);
  carto.height = heightInMetres;
  return Cartographic.toCartesian(carto);
}

export default DropPedestrian;
