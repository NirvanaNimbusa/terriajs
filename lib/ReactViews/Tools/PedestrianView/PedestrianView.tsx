import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import TerriaError from "../../../Core/TerriaError";
import Cesium from "../../../Models/Cesium";
import raiseErrorToUser from "../../../Models/raiseErrorToUser";
import ViewState from "../../../ReactViewModels/ViewState";
import CapturePosition from "./CapturePosition";

type PropsType = {
  viewState: ViewState;
};

const PedestrianView: React.FC<PropsType> = props => {
  const { viewState } = props;
  const [t] = useTranslation();
  const [position, setPosition] = useState();

  const terria = viewState.terria;
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
      {!position && (
        <CapturePosition cesium={cesium} onPosition={setPosition} />
      )}
    </>
  );
};

export default PedestrianView;
