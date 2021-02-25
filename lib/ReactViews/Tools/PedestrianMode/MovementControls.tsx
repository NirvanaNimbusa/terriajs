import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Cesium from "../../../Models/Cesium";
import Icon, { StyledIcon } from "../../Icon";
import MovementsController from "./MovementsController";

const Text = require("../../../Styled/Text").default;
const Box = require("../../../Styled/Box").default;
const Spacing = require("../../../Styled/Spacing").default;
const Button = require("../../../Styled/Button").default;

const mouseControlsImage = require("../../../../wwwroot/images/mouse-control.svg");
const wasdControlsImage = require("../../../../wwwroot/images/wasd.svg");
const heightControlsImage = require("../../../../wwwroot/images/height-controls.svg");

export type MovementControlsProps = {
  cesium: Cesium;
  onMove: () => void;
  mode:
    | ["walk", "clampToScene"]
    | ["walk", "clampToTerrain"]
    | ["walk", "clampToMax"]
    | ["fly"];
  onChangeMode: (newMode: MovementControlsProps["mode"]) => void;
};

const MovementControls: React.FC<MovementControlsProps> = props => {
  const [isMaximized, setIsMaximized] = useState(true);
  const [t] = useTranslation();

  const toggleMaximized = () => setIsMaximized(!isMaximized);

  const [movementsController] = useState(
    new MovementsController(props.cesium, props.onMove, mode =>
      props.onChangeMode(mode)
    )
  );

  useEffect(() => {
    movementsController.attach();
    return () => movementsController.detach();
  }, [props.cesium]);

  const { mode } = props;

  useEffect(() => {
    movementsController.setMode(mode);
  }, [mode]);

  const isWalking = mode[0] === "walk";
  const isFlying = mode[0] === "fly";
  const clampToScene = mode[1] === "clampToScene";
  const clampToTerrain = mode[1] === "clampToTerrain";
  const clampToMax = mode[1] === "clampToMax";

  const onModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onChangeMode = props.onChangeMode;
    const input = e.target;
    if (input.name === "mode") {
      /* if (input.value === "walk") onChangeMode(["walk", "clampToScene"]);
       * if (input.value === "fly") onChangeMode(["fly"]); */
    } else if (input.name === "clampMode") {
      onChangeMode(["walk", input.value as any]);
    }
  };

  return (
    <>
      <Container>
        <Title>
          <Text medium>{t("pedestrianMode.controls.title")}</Text>
          <MinimizeMaximizeButton
            onClick={toggleMaximized}
            maximized={isMaximized}
          />
        </Title>
        {isMaximized && (
          <Body>
            <img alt="Mouse controls" src={mouseControlsImage} />
            <img alt="Direction controls" src={wasdControlsImage} />
            <Spacing bottom={1} />
            <img alt="Height controls" src={heightControlsImage} />
          </Body>
        )}
      </Container>
      <Modes onChange={onModeChange}>
        <label>
          <input name="mode" value="walk" type="radio" checked={isWalking} />
          <span>Walk</span>
          <fieldset>
            <label>
              <input
                type="radio"
                name="clampMode"
                value="clampToScene"
                disabled={isWalking === false}
                checked={clampToScene}
              />
              <span>Clamp to tileset</span>
            </label>
            <label>
              <input
                type="radio"
                name="clampMode"
                value="clampToTerrain"
                disabled={isWalking === false}
                checked={clampToTerrain}
              />
              <span>Clamp to terrain</span>
            </label>
            <label>
              <input
                type="radio"
                name="clampMode"
                value="clampToMax"
                disabled={isWalking === false}
                checked={clampToMax}
              />
              <span>Clamp to max</span>
            </label>
          </fieldset>
        </label>
        <label>
          <input name="mode" value="fly" type="radio" checked={isFlying} />
          <span>Fly</span>
        </label>
      </Modes>
    </>
  );
};

const Container = styled.div`
  background-color: white;
`;

const Title = styled(Box).attrs({
  medium: true
})`
  justify-content: space-between;
  align-items: center;
  padding: 0 0.5em;
  border-bottom: 1px solid #c0c0c0;
`;

const MinimizeMaximizeButton = styled(Button).attrs(props => ({
  renderIcon: () => (
    <ButtonIcon
      glyph={props.maximized ? Icon.GLYPHS.minimize : Icon.GLYPHS.maximize}
    />
  )
}))<{ maximized: boolean }>`
  padding: 0;
  margin: 0;
  border: 0;
`;

const ButtonIcon = styled(StyledIcon)`
  height: 20px;
`;

const Body = styled(Box).attrs({ column: true, centered: true })`
  background-color: #f0f0f0;
  align-items: center;
  margin-top: 1em;
  & img {
    padding-bottom: 1em;
  }
`;

const Modes = styled.div`
  margin-top: 1em;
  padding: 0.5em;
  background-color: white;

  & label {
    display: block;
  }

  & input {
    margin-right: 0.5em;
  }

  & fieldset {
    border: 0;
    & label {
      font-size: 0.7em;
    }
  }
`;

export default MovementControls;
