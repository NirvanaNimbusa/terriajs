import debounce from "lodash-es/debounce";
import { runInAction } from "mobx";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import EllipsoidTerrainProvider from "terriajs-cesium/Source/Core/EllipsoidTerrainProvider";
import KeyboardEventModifier from "terriajs-cesium/Source/Core/KeyboardEventModifier";
import sampleTerrainMostDetailed from "terriajs-cesium/Source/Core/sampleTerrainMostDetailed";
import ScreenSpaceEventHandler from "terriajs-cesium/Source/Core/ScreenSpaceEventHandler";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import makeRealPromise from "../../../Core/makeRealPromise";
import Cesium from "../../../Models/Cesium";

const horizontalMovements = ["forward", "backward", "left", "right"] as const;

type HorizontalMovements = typeof horizontalMovements[number];

type Movements = HorizontalMovements | "up" | "down" | "look";

const KeyMap: Record<KeyboardEvent["code"], Movements> = {
  KeyW: "forward",
  KeyA: "left",
  KeyS: "backward",
  KeyD: "right",
  Space: "up",
  ShiftLeft: "down",
  ShiftRight: "down"
};

type Mode = "fly" | "walk";

const moveScratch = new Cartesian3();

export default class MovementsController {
  private destroyEventHandlers?: () => void;
  private activeMovements = new Set<Movements>();

  private startMousePosition?: Cartesian2;
  private currentMousePosition?: Cartesian2;

  private mode: Mode = "walk";
  private readonly walkingHeightFromTerrain = 1.5; // metres
  private readonly minFlyHeightFromTerrain = 1.5; // metres

  private readonly debouncedUpdateTerrainHeight: () => void;
  private currentTerrainHeight = 0;

  private terrainRequests = 0;

  constructor(readonly cesium: Cesium, readonly onMove: () => void) {
    this.debouncedUpdateTerrainHeight = debounce(
      this._updateTerrainHeight.bind(this),
      250,
      { maxWait: 250 }
    );
    this.currentTerrainHeight = this.scene.camera.positionCartographic.height;
    this.debouncedUpdateTerrainHeight();
  }

  get scene() {
    return this.cesium.scene;
  }

  get currentHeightFromTerrain(): number {
    return parseFloat(
      (
        this.scene.camera.positionCartographic.height -
        this.currentTerrainHeight
      ).toPrecision(3)
    );
  }

  get moveRate() {
    if (this.mode === "walk") return 0.2;
    const height = Math.abs(this.currentHeightFromTerrain);
    const moveRate = Math.max(0.05, height / 20);
    //console.log(moveRate, height / 10, height / 20, height / 30, height / 50);
    return moveRate;
  }

  moveHorizontally(
    position: Cartesian3,
    direction: Cartesian3,
    moveRate: number
  ): Cartesian3 {
    const directionAlongSurface = projectVectorToSurface(
      direction,
      position,
      this.scene.globe.ellipsoid
    );

    Cartesian3.multiplyByScalar(directionAlongSurface, moveRate, moveScratch);
    const nextPosition = Cartesian3.add(
      position,
      moveScratch,
      new Cartesian3()
    );
    return nextPosition;
  }

  moveForward(currentPosition: Cartesian3): Cartesian3 {
    return this.moveHorizontally(
      currentPosition,
      this.scene.camera.direction,
      this.moveRate
    );
  }

  moveBackward(currentPosition: Cartesian3) {
    return this.moveHorizontally(
      currentPosition,
      this.scene.camera.direction,
      -this.moveRate
    );
  }

  moveLeft(currentPosition: Cartesian3) {
    return this.moveHorizontally(
      currentPosition,
      this.scene.camera.right,
      -this.moveRate / 2
    );
  }

  moveRight(currentPosition: Cartesian3) {
    return this.moveHorizontally(
      currentPosition,
      this.scene.camera.right,
      this.moveRate / 2
    );
  }

  /* moveForward() {
   *   const camera = this.scene.camera;
   *   const direction = projectVectorToSurface(
   *     camera.direction,
   *     camera.position,
   *     this.scene.globe.ellipsoid
   *   );

   *   Cartesian3.multiplyByScalar(direction, this.moveRate, moveScratch);
   *   const forwardPosition = Cartesian3.add(
   *     camera.position,
   *     moveScratch,
   *     new Cartesian3()
   *   );
   *   if (this.scene.clampToHeightSupported) {
   *     const currentScenePosition = this.scene.clampToHeight(camera.position);
   *     const forwardScenePosition = this.scene.clampToHeight(forwardPosition);
   *     if (currentScenePosition && forwardScenePosition) {
   *       const currentHeight = Cartographic.fromCartesian(currentScenePosition)
   *         .height;
   *       const forwardHeight = Cartographic.fromCartesian(forwardScenePosition)
   *         .height;
   *       const stepHeight = Math.abs(forwardHeight - currentHeight);
   *       //console.log(stepHeight, stepHeight > 5);
   *       if (stepHeight > 5) {
   *         return;
   *       }
   *     }
   *   }

   *   camera.position = forwardPosition;
   * }

   * moveBackward() {
   *   const camera = this.scene.camera;
   *   const direction = projectVectorToSurface(
   *     camera.direction,
   *     camera.position,
   *     this.scene.globe.ellipsoid
   *   );
   *   camera.move(direction, -this.moveRate);
   * }

   * moveLeft() {
   *   const camera = this.scene.camera;
   *   const direction = projectVectorToSurface(
   *     camera.right,
   *     camera.position,
   *     this.scene.globe.ellipsoid
   *   );
   *   camera.move(direction, -this.moveRate / 2);
   * }

   * moveRight() {
   *   const camera = this.scene.camera;
   *   const direction = projectVectorToSurface(
   *     camera.right,
   *     camera.position,
   *     this.scene.globe.ellipsoid
   *   );
   *   camera.move(direction, this.moveRate / 2);
   * } */

  moveUp() {
    const camera = this.scene.camera;
    const ellipsoid = this.scene.globe.ellipsoid;
    const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
      camera.position,
      moveScratch
    );
    camera.move(surfaceNormal, this.moveRate);
    if (this.mode !== "fly") {
      this.mode = "fly";
    }
  }

  moveDown() {
    const camera = this.scene.camera;
    const ellipsoid = this.scene.globe.ellipsoid;
    const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
      camera.position,
      moveScratch
    );
    camera.move(surfaceNormal, -this.moveRate);
    if (
      this.mode !== "walk" &&
      this.currentHeightFromTerrain <= this.walkingHeightFromTerrain
    ) {
      this.mode = "walk";
    }
  }

  look() {
    if (
      this.startMousePosition === undefined ||
      this.currentMousePosition === undefined
    )
      return;

    const startMousePosition = this.startMousePosition;
    const currentMousePosition = this.currentMousePosition;

    const camera = this.scene.camera;
    const canvas = this.scene.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const x = (currentMousePosition.x - startMousePosition.x) / width;
    const y = (currentMousePosition.y - startMousePosition.y) / height;
    const lookFactor = 0.1;

    const ellipsoid = this.scene.globe.ellipsoid;
    const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
      camera.position,
      moveScratch
    );

    const right = projectVectorToSurface(
      camera.right,
      camera.position,
      this.scene.globe.ellipsoid
    );

    camera.look(surfaceNormal, x * lookFactor);
    camera.look(right, y * lookFactor);
  }

  private _updateTerrainHeight() {
    const camera = this.scene.camera;
    const terrainProvider = this.scene.terrainProvider;

    let sceneHeight: number | undefined;
    if (this.mode === "walk" && this.scene.clampToHeightSupported) {
      const positionOnSceneSurface = this.scene.clampToHeight(
        camera.position.clone()
      );
      if (positionOnSceneSurface) {
        sceneHeight = Cartographic.fromCartesian(positionOnSceneSurface).height;
      }
    }

    if (terrainProvider instanceof EllipsoidTerrainProvider) {
      this.currentTerrainHeight = sceneHeight ?? 0;
    } else if (this.terrainRequests < 5) {
      this.terrainRequests += 1;
      makeRealPromise<Cartographic[]>(
        sampleTerrainMostDetailed(terrainProvider, [
          camera.positionCartographic.clone()
        ])
      )
        .then(([terrainPosition]) => {
          this.currentTerrainHeight =
            sceneHeight === undefined
              ? terrainPosition.height
              : Math.max(terrainPosition.height, sceneHeight);
          /* console.log(
           *   sceneHeight,
           *   terrainPosition.height,
           *   this.currentTerrainHeight
           * ); */
        })
        .finally(() => {
          this.terrainRequests -= 1;
        });
    }
  }

  canMoveTo(fromPosition: Cartesian3, toPosition: Cartesian3) {
    const scene = this.scene;

    if (!scene.clampToHeightSupported) return true;

    const fromPositionOnSurface = this.scene.clampToHeight(fromPosition);
    const toPositionOnSurface = this.scene.clampToHeight(toPosition);

    if (
      fromPositionOnSurface === undefined ||
      toPositionOnSurface === undefined
    ) {
      return true;
    }

    const currentHeight = Cartographic.fromCartesian(fromPositionOnSurface)
      .height;
    const nextHeight = Cartographic.fromCartesian(toPositionOnSurface).height;
    const heightChange = Math.abs(currentHeight - nextHeight);
    const canMove = heightChange < 5;

    console.log("**canMoveTo**", canMove, heightChange);

    return canMove;
  }

  animateHeightChange() {
    const camera = this.scene.camera;
    const currentHeightFromTerrain = this.currentHeightFromTerrain;
    let moveUpStep = 0;
    if (
      this.mode === "walk" &&
      currentHeightFromTerrain !== this.walkingHeightFromTerrain
    ) {
      const moveRate = this.moveRate / 4;
      const fullStep =
        this.walkingHeightFromTerrain - this.currentHeightFromTerrain;
      if (fullStep >= 0) moveUpStep = Math.min(fullStep, fullStep * moveRate);
      else moveUpStep = Math.max(fullStep, fullStep * moveRate);
    } else if (
      this.mode === "fly" &&
      currentHeightFromTerrain < this.minFlyHeightFromTerrain
    ) {
      const fullStep = this.minFlyHeightFromTerrain - currentHeightFromTerrain;
      moveUpStep = Math.min(fullStep, fullStep / this.moveRate);
    }

    if (moveUpStep !== 0) {
      const surfaceOffset = Cartesian3.multiplyByScalar(
        camera.up,
        moveUpStep,
        moveScratch
      );
      Cartesian3.add(camera.position, surfaceOffset, camera.position);
    }
  }

  animate() {
    const activeHorizontalMovements: HorizontalMovements[] = horizontalMovements.filter(
      m => this.activeMovements.has(m)
    );

    if (activeHorizontalMovements.length > 0) {
      const currentPosition = this.scene.camera.position.clone();
      const nextHorizontalMovePosition = horizontalMovements.reduce(
        (position, direction) => {
          let nextPosition: Cartesian3;
          if (this.activeMovements.has(direction) === false) {
            return position;
          }
          switch (direction) {
            case "forward":
              nextPosition = this.moveForward(position);
              break;
            case "backward":
              nextPosition = this.moveBackward(position);
              break;
            case "left":
              nextPosition = this.moveLeft(position);
              break;
            case "right":
              nextPosition = this.moveRight(position);
              break;
          }
          return nextPosition;
        },
        currentPosition.clone()
      );

      if (this.mode === "fly") {
        this.scene.camera.position = nextHorizontalMovePosition;
      } else if (
        this.mode === "walk" &&
        this.canMoveTo(currentPosition, nextHorizontalMovePosition)
      ) {
        this.scene.camera.position = nextHorizontalMovePosition;
      }
    }

    this.activeMovements.forEach(m => {
      switch (m) {
        /* case "forward":
         *   this.moveForward();
         *   break;
         * case "backward":
         *   this.moveBackward();
         *   break;
         * case "left":
         *   this.moveLeft();
         *   break;
         * case "right":
         *   this.moveRight();
         *   break; */
        case "up":
          this.moveUp();
          break;
        case "down":
          this.moveDown();
          break;
        case "look":
          this.look();
          break;
      }
    });

    if (this.activeMovements.size > 0) {
      this.onMove();
      this.debouncedUpdateTerrainHeight();
    }

    this.animateHeightChange();
  }

  setupKeyMap() {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (
        // do not match if any modifiers are pressed so that we do not hijack window shortcuts.
        ev.ctrlKey === false &&
        ev.altKey === false &&
        KeyMap[ev.code] !== undefined
      )
        this.activeMovements.add(KeyMap[ev.code]);
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (KeyMap[ev.code] !== undefined)
        this.activeMovements.delete(KeyMap[ev.code]);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const keyMapDestroyer = () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };

    return keyMapDestroyer;
  }

  setupMouseMap() {
    const eventHandler = new ScreenSpaceEventHandler(this.scene.canvas);

    const startLook = (click: { position: Cartesian2 }) => {
      this.currentMousePosition = this.startMousePosition = click.position.clone();
      this.activeMovements.add("look");
    };

    const look = (movement: { endPosition: Cartesian2 }) => {
      this.currentMousePosition = movement.endPosition.clone();
    };

    const stopLook = () => {
      this.activeMovements.delete("look");
      this.currentMousePosition = this.startMousePosition = undefined;
    };

    // User might try to turn while moving down (by pressing SHIFT)
    // so trigger look event even when SHIFT is pressed.
    eventHandler.setInputAction(startLook, ScreenSpaceEventType.LEFT_DOWN);
    eventHandler.setInputAction(
      startLook,
      ScreenSpaceEventType.LEFT_DOWN,
      KeyboardEventModifier.SHIFT
    );

    eventHandler.setInputAction(look, ScreenSpaceEventType.MOUSE_MOVE);
    eventHandler.setInputAction(
      look,
      ScreenSpaceEventType.MOUSE_MOVE,
      KeyboardEventModifier.SHIFT
    );

    eventHandler.setInputAction(stopLook, ScreenSpaceEventType.LEFT_UP);
    eventHandler.setInputAction(
      stopLook,
      ScreenSpaceEventType.LEFT_UP,
      KeyboardEventModifier.SHIFT
    );

    const mouseMapDestroyer = () => eventHandler.destroy();
    return mouseMapDestroyer;
  }

  attach() {
    // Disable other map controls
    this.scene.screenSpaceCameraController.enableTranslate = false;
    this.scene.screenSpaceCameraController.enableRotate = false;
    this.scene.screenSpaceCameraController.enableLook = false;
    this.scene.screenSpaceCameraController.enableTilt = false;
    this.scene.screenSpaceCameraController.enableZoom = false;

    runInAction(() => {
      this.cesium.isFeaturePickingPaused = true;
    });

    const destroyKeyMap = this.setupKeyMap();
    const destroyMouseMap = this.setupMouseMap();
    const destroyAnimation = this.cesium.cesiumWidget.clock.onTick.addEventListener(
      this.animate.bind(this)
    );

    this.destroyEventHandlers = () => {
      destroyKeyMap();
      destroyMouseMap();
      destroyAnimation();
    };
  }

  detach() {
    this.destroyEventHandlers?.();
    const screenSpaceCameraController = this.scene.screenSpaceCameraController;
    // screenSpaceCameraController will be undefined if the cesium map is already destroyed
    if (screenSpaceCameraController !== undefined) {
      screenSpaceCameraController.enableTranslate = true;
      screenSpaceCameraController.enableRotate = true;
      screenSpaceCameraController.enableLook = true;
      screenSpaceCameraController.enableTilt = true;
      screenSpaceCameraController.enableZoom = true;
    }

    runInAction(() => {
      this.cesium.isFeaturePickingPaused = false;
    });
  }
}

/**
 * Projects the {@vector} to the surface plane containing {@position}
 *
 * @param vector The input vector to project
 * @param position The position used to determine the surface plane
 * @param ellipsoid The ellipsoid used to compute the surface plane
 * @returns The projection of {@vector} on the surface plane at the given {@position}
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
