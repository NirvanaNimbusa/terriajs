import { action, autorun, computed } from "mobx";
import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Color from "terriajs-cesium/Source/Core/Color";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import CallbackProperty from "terriajs-cesium/Source/DataSources/CallbackProperty";
import CustomDataSource from "terriajs-cesium/Source/DataSources/CustomDataSource";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import PointGraphics from "terriajs-cesium/Source/DataSources/PointGraphics";
import CreateModel from "../../../Models/CreateModel";
import Mappable from "../../../Models/Mappable";
import Terria from "../../../Models/Terria";
import ViewerMode from "../../../Models/ViewerMode";
import ViewState from "../../../ReactViewModels/ViewState";
import MappableTraits from "../../../Traits/MappableTraits";
import TerriaViewer from "../../../ViewModels/TerriaViewer";

type MiniMapProps = {
  viewState: ViewState;
  view: { rectangle: Rectangle; position: Cartesian3 };
};

class MappableMarker extends CreateModel(MappableTraits) implements Mappable {
  private dataSource: CustomDataSource;
  private entity: Entity;

  position: Cartesian3;

  constructor(terria: Terria, position: Cartesian3) {
    super(undefined, terria);
    this.position = position;
    this.dataSource = new CustomDataSource();
    this.entity = new Entity({
      point: new PointGraphics({
        pixelSize: 10,
        color: Color.BLUEVIOLET,
        outlineColor: Color.WHITE,
        outlineWidth: 1
      }),
      position: new CallbackProperty(() => {
        return this.position;
      }, false) as any
    });
    this.dataSource.entities.add(this.entity);
  }

  loadMapItems() {
    return Promise.resolve();
  }

  get mapItems() {
    return [this.dataSource];
  }
}

const MiniMap: React.FC<MiniMapProps> = props => {
  const { viewState, view } = props;
  const terria = viewState.terria;
  const container = useRef<HTMLDivElement>(null);
  const [terriaViewer, setTerriaViewer] = useState<TerriaViewer | undefined>();
  const locationMarker = new MappableMarker(viewState.terria, view.position);

  useEffect(
    action(() => {
      const viewer = new TerriaViewer(
        terria,
        computed(() => [locationMarker])
      );

      setTerriaViewer(viewer);

      viewer.viewerMode = ViewerMode.Leaflet;
      viewer.disableInteraction = true;
      viewer.homeCamera = terria.mainViewer.homeCamera;
      if (container.current) {
        viewer.attach(container.current);
      }

      // Choose positron if it's available
      const baseMap = terria.baseMaps[0]?.mappable;
      if (baseMap) viewer.baseMap = baseMap;

      return () => {
        viewer.destroy();
      };
    }),
    []
  );

  useEffect(
    action(() => {
      const disposer = autorun(() => {
        if (terriaViewer) terriaViewer.currentViewer.zoomTo(view.rectangle, 0);
        locationMarker.position = view.position;
      });
      return disposer;
    }),
    [terriaViewer, view]
  );

  return (
    <MapContainer
      ref={container}
      isMapFullScreen={viewState.isMapFullScreen}
    ></MapContainer>
  );
};

const MapContainer = styled.div<{ isMapFullScreen: boolean }>`
  position: absolute;
  width: 150px;
  height: 175px;
  top: unset;
  left: 0px;
  bottom: 90px;
  margin-left: ${props =>
    props.isMapFullScreen ? 16 : parseInt(props.theme.workbenchWidth) + 30}px};
  transition: margin-left 0.25s;

  border: 1px solid white;
  box-shadow: 1px 1px black;

  & .leaflet-control-attribution {
    display: none;
  }
`;

export default MiniMap;
