import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import HeadingPitchRoll from "terriajs-cesium/Source/Core/HeadingPitchRoll";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Matrix3 from "terriajs-cesium/Source/Core/Matrix3";
import Matrix4 from "terriajs-cesium/Source/Core/Matrix4";
import PerspectiveFrustum from "terriajs-cesium/Source/Core/PerspectiveFrustum";
import Quaternion from "terriajs-cesium/Source/Core/Quaternion";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import sampleTerrainMostDetailed from "terriajs-cesium/Source/Core/sampleTerrainMostDetailed";
import ScreenSpaceEventHandler from "terriajs-cesium/Source/Core/ScreenSpaceEventHandler";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import Transforms from "terriajs-cesium/Source/Core/Transforms";
import Camera from "terriajs-cesium/Source/Scene/Camera";
import Scene from "terriajs-cesium/Source/Scene/Scene";
import TerriaError from "../../../Core/TerriaError";
import Cesium from "../../../Models/Cesium";
import raiseErrorToUser from "../../../Models/raiseErrorToUser";
import ViewState from "../../../ReactViewModels/ViewState";
import DropPedestrian from "./DropPedestrian";
import MiniMap from "./MiniMap";

type View = {
  rectangle: Rectangle;
  position: Cartesian3;
};

type PropsType = {
  viewState: ViewState;
};

const PedestrianView: React.FC<PropsType> = props => {
  const { viewState } = props;
  const terria = viewState.terria;
  const [t] = useTranslation();
  const [initialPosition, setInitialPosition] = useState<
    Cartesian3 | undefined
  >();
  const [view, setView] = useState<View | undefined>();

  const currentViewer = terria.currentViewer;
  if (!(currentViewer instanceof Cesium)) {
    raiseErrorToUser(
      terria,
      new TerriaError({
        title: t("pedestrianView.requiresCesium.title"),
        message: t("pedestrianView.requiresCesium.message")
      })
    );
    return null;
  }

  const cesium = currentViewer;

  return (
    <>
      {!initialPosition && (
        <DropPedestrian cesium={cesium} afterDrop={setInitialPosition} />
      )}
      {initialPosition && (
        <MovementControls
          cesium={cesium}
          initialPosition={initialPosition}
          onViewChange={setView}
        />
      )}
      {initialPosition && (
        <MiniMap viewState={viewState} view={view || getView(cesium.scene)} />
      )}
    </>
  );
};

type MovementControlsProps = {
  cesium: Cesium;
  initialPosition: Cartesian3;
  onViewChange: (view: View) => void;
};

const MovementControls: React.FC<MovementControlsProps> = props => {
  useEffect(() => {
    const { cesium } = props;
    const scene = cesium.scene;
    const eventHandler = new ScreenSpaceEventHandler(cesium.scene.canvas);

    scene.screenSpaceCameraController.enableInputs = false;

    const movements = new Set();
    const keyMap: Record<string, string> = {
      KeyW: "moveForward",
      KeyA: "moveLeft",
      KeyS: "moveBackward",
      KeyD: "moveRight",
      Space: "moveUp",
      ShiftLeft: "moveDown",
      ShiftRight: "moveDown"
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (keyMap[ev.code] !== undefined) movements.add(keyMap[ev.code]);
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (keyMap[ev.code] !== undefined) movements.delete(keyMap[ev.code]);
    };

    let startMousePosition: Cartesian2 | undefined;
    let mousePosition: Cartesian2 | undefined;
    eventHandler.setInputAction(movement => {
      mousePosition = startMousePosition = movement.position.clone();
      movements.add("look");
    }, ScreenSpaceEventType.LEFT_DOWN);

    eventHandler.setInputAction(movement => {
      mousePosition = movement.endPosition.clone();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    eventHandler.setInputAction(() => {
      movements.delete("look");
      startMousePosition = mousePosition = undefined;
    }, ScreenSpaceEventType.LEFT_UP);

    const animate = () => {
      const camera = cesium.scene.camera;
      const height = camera.positionCartographic.height;
      const moveRate = height / 10;

      movements.forEach(m => {
        let forwardDirection: Cartesian3;
        let rightDirection: Cartesian3;
        switch (m) {
          case "moveForward":
            forwardDirection = projectVectorToSurface(
              camera.direction,
              camera.position,
              cesium.scene.globe.ellipsoid
            );
            camera.move(forwardDirection, moveRate);
            break;
          case "moveBackward":
            forwardDirection = projectVectorToSurface(
              camera.direction,
              camera.position,
              cesium.scene.globe.ellipsoid
            );
            camera.move(forwardDirection, -moveRate);
            break;
          case "moveLeft":
            rightDirection = projectVectorToSurface(
              camera.right,
              camera.position,
              cesium.scene.globe.ellipsoid
            );
            camera.move(rightDirection, -moveRate);
            break;
          case "moveRight":
            rightDirection = projectVectorToSurface(
              camera.right,
              camera.position,
              cesium.scene.globe.ellipsoid
            );
            camera.move(rightDirection, moveRate);
            break;
          case "moveUp":
            camera.moveUp(moveRate);
            break;
          case "moveDown":
            camera.moveDown(moveRate);
            break;
          case "look":
            if (startMousePosition && mousePosition)
              cameraLook(scene, startMousePosition, mousePosition);
            break;
          default:
            return;
        }

        const view = getView(cesium.scene);
        if (view) props.onViewChange(view);
        resurfaceIfUnderground(scene);
      });
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    const disposeAnimation = cesium.cesiumWidget.clock.onTick.addEventListener(
      animate
    );

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      eventHandler.destroy();
      disposeAnimation();
      if (scene.screenSpaceCameraController)
        scene.screenSpaceCameraController.enableInputs = true;
      /* cesium.dataSourceDisplay.dataSources.remove(dataSource); */
    };
  }, []);
  return null;
};

/* function getView(cesium: Cesium): View {
 *   const cameraRectangle = cesium.getCurrentCameraView().rectangle;
 *   const position = cesium.scene.camera.position;
 *   console.log(
 *     {
 *       west: CesiumMath.toDegrees(cameraRectangle.west),
 *       east: CesiumMath.toDegrees(cameraRectangle.east),
 *       north: CesiumMath.toDegrees(cameraRectangle.north),
 *       south: CesiumMath.toDegrees(cameraRectangle.south)
 *     },
 *     position
 *   );
 *   return {
 *     rectangle: cameraRectangle,
 *     position
 *   };
 * } */

var cartesian3Scratch = new Cartesian3();
var enuToFixedScratch = new Matrix4();
var southwestScratch = new Cartesian3();
var southeastScratch = new Cartesian3();
var northeastScratch = new Cartesian3();
var northwestScratch = new Cartesian3();
var southwestCartographicScratch = new Cartographic();
var southeastCartographicScratch = new Cartographic();
var northeastCartographicScratch = new Cartographic();
var northwestCartographicScratch = new Cartographic();

function getView(scene: Scene): View {
  const camera = scene.camera;
  const ellipsoid = scene.globe.ellipsoid;

  const frustrum = scene.camera.frustum as PerspectiveFrustum;

  const fovy = frustrum.fovy * 0.5;
  const fovx = Math.atan(Math.tan(fovy) * frustrum.aspectRatio);

  const center = camera.positionWC.clone();
  const cameraOffset = Cartesian3.subtract(
    camera.positionWC,
    center,
    cartesian3Scratch
  );
  const cameraHeight = Cartesian3.magnitude(cameraOffset);
  const xDistance = cameraHeight * Math.tan(fovx);
  const yDistance = cameraHeight * Math.tan(fovy);

  const southwestEnu = new Cartesian3(-xDistance, -yDistance, 0.0);
  const southeastEnu = new Cartesian3(xDistance, -yDistance, 0.0);
  const northeastEnu = new Cartesian3(xDistance, yDistance, 0.0);
  const northwestEnu = new Cartesian3(-xDistance, yDistance, 0.0);

  const enuToFixed = Transforms.eastNorthUpToFixedFrame(
    center,
    ellipsoid,
    enuToFixedScratch
  );
  const southwest = Matrix4.multiplyByPoint(
    enuToFixed,
    southwestEnu,
    southwestScratch
  );
  const southeast = Matrix4.multiplyByPoint(
    enuToFixed,
    southeastEnu,
    southeastScratch
  );
  const northeast = Matrix4.multiplyByPoint(
    enuToFixed,
    northeastEnu,
    northeastScratch
  );
  const northwest = Matrix4.multiplyByPoint(
    enuToFixed,
    northwestEnu,
    northwestScratch
  );

  const southwestCartographic = ellipsoid.cartesianToCartographic(
    southwest,
    southwestCartographicScratch
  );
  const southeastCartographic = ellipsoid.cartesianToCartographic(
    southeast,
    southeastCartographicScratch
  );
  const northeastCartographic = ellipsoid.cartesianToCartographic(
    northeast,
    northeastCartographicScratch
  );
  const northwestCartographic = ellipsoid.cartesianToCartographic(
    northwest,
    northwestCartographicScratch
  );

  // Account for date-line wrapping
  if (southeastCartographic.longitude < southwestCartographic.longitude) {
    southeastCartographic.longitude += CesiumMath.TWO_PI;
  }
  if (northeastCartographic.longitude < northwestCartographic.longitude) {
    northeastCartographic.longitude += CesiumMath.TWO_PI;
  }

  const rectangle = new Rectangle(
    CesiumMath.convertLongitudeRange(
      Math.min(southwestCartographic.longitude, northwestCartographic.longitude)
    ),
    Math.min(southwestCartographic.latitude, southeastCartographic.latitude),
    CesiumMath.convertLongitudeRange(
      Math.max(northeastCartographic.longitude, southeastCartographic.longitude)
    ),
    Math.max(northeastCartographic.latitude, northwestCartographic.latitude)
  );

  // center isn't a member variable and doesn't seem to be used anywhere else in Terria
  // rect.center = center;
  return {
    rectangle,
    position: camera.position
  };
}

function resurfaceIfUnderground(scene: Scene) {
  const camera = scene.camera;
  sampleTerrainMostDetailed(scene.terrainProvider, [
    camera.positionCartographic.clone()
  ]).then(([terrainPosition]) => {
    const heightFromTerrain =
      camera.positionCartographic.height - terrainPosition.height;
    if (heightFromTerrain < 1) {
      const surfaceOffset = Cartesian3.multiplyByScalar(
        camera.up,
        -heightFromTerrain,
        new Cartesian3()
      );
      Cartesian3.add(camera.position, surfaceOffset, camera.position);
    }
  });
}

/**
 *  Vector = ProjectionOnSurfaceNormal + ProjectionOnSurface
 *
 */
function projectVectorToSurface(
  vector: Cartesian3,
  position: Cartesian3,
  ellipsoid: Ellipsoid
) {
  const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
    position,
    new Cartesian3()
  );
  const magnitudeOfProjectionOnSurfaceNormal = Cartesian3.dot(
    vector,
    surfaceNormal
  );
  const projectionOnSurfaceNormal = Cartesian3.multiplyByScalar(
    surfaceNormal,
    magnitudeOfProjectionOnSurfaceNormal,
    new Cartesian3()
  );
  const projectionOnSurface = Cartesian3.subtract(
    vector,
    projectionOnSurfaceNormal,
    new Cartesian3()
  );
  return projectionOnSurface;
}

function verticalHeightFromTerrain(scene: Scene) {
  return scene.globe.getHeight(scene.camera.positionCartographic);
}

function cameraLook(
  scene: Scene,
  startMousePosition: Cartesian2,
  currentMousePosition: Cartesian2
) {
  const camera = scene.camera;
  const canvas = scene.canvas;
  const width = canvas.width;
  const height = canvas.height;
  const x = (currentMousePosition.x - startMousePosition.x) / width;
  const y = (currentMousePosition.y - startMousePosition.y) / height;
  const lookFactor = 0.1;

  const ellipsoid = scene.globe.ellipsoid;
  const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
    camera.position,
    new Cartesian3()
  );
  const surfaceTangent = Cartesian3.cross(
    surfaceNormal,
    Cartesian3.UNIT_X,
    new Cartesian3()
  );

  const right = projectVectorToSurface(
    camera.right,
    camera.position,
    scene.globe.ellipsoid
  );

  camera.look(surfaceNormal, x * lookFactor);
  camera.look(right, y * lookFactor);

  /* camera.lookRight(x * lookFactor);
   * camera.lookUp(y * lookFactor); */
}

function lookUp(camera: Camera, angle: number) {
  const axis = camera.right;
  const quaternion = Quaternion.fromAxisAngle(axis, -angle, new Quaternion());
  const rotation = Matrix3.fromQuaternion(quaternion, new Matrix3());
  Matrix3.multiplyByVector(rotation, camera.direction, camera.direction);
  Matrix3.multiplyByVector(rotation, camera.up, camera.up);
  /* Matrix3.multiplyByVector(rotation, camera.right, camera.right); */
}

function lookRight(camera: Camera, angle: number) {
  const axis = camera.up;
  const quaternion = Quaternion.fromAxisAngle(axis, -angle, new Quaternion());
  const rotation = Matrix3.fromQuaternion(quaternion, new Matrix3());
  Matrix3.multiplyByVector(rotation, camera.direction, camera.direction);
  Matrix3.multiplyByVector(rotation, camera.up, camera.up);
  /* Matrix3.multiplyByVector(rotation, camera.right, camera.right); */
}

export default PedestrianView;
