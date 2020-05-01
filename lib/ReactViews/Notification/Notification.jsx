"use strict";

import defined from "terriajs-cesium/Source/Core/defined";
import React from "react";
import createReactClass from "create-react-class";
import PropTypes from "prop-types";
import NotificationWindow from "./NotificationWindow";
import triggerResize from "../../Core/triggerResize";
import { observer } from "mobx-react";
import { runInAction } from "mobx";

const Notification = observer(
  createReactClass({
    displayName: "Notification",

    propTypes: {
      viewState: PropTypes.object
    },

    confirm() {
      const notification = this.props.viewState.notifications[0];
      if (notification && notification.confirmAction) {
        notification.confirmAction();
      }

      this.close(notification);
    },

    deny() {
      const notification = this.props.viewState.notifications[0];
      if (notification && notification.denyAction) {
        notification.denyAction();
      }

      this.close(notification);
    },

    close(notification) {
      runInAction(() => {
        this.props.viewState.notifications.splice(0, 1);
      });

      // Force refresh once the notification is dispached if .hideUi is set since once all the .hideUi's
      // have been dispatched the UI will no longer be suppressed causing a change in the view state.
      if (notification && notification.hideUi) {
        triggerResize();
      }
    },

    render() {
      console.log(this.props.viewState.notifications);
      const notification =
        (this.props.viewState.notifications.length > 0 &&
          this.props.viewState.notifications[0]) ||
        null;
      return (
        notification && (
          <NotificationWindow
            title={notification.title}
            message={notification.message}
            confirmText={notification.confirmText}
            denyText={notification.denyText}
            onConfirm={this.confirm}
            onDeny={this.deny}
            type={
              defined(notification.type) ? notification.type : "notification"
            }
            width={notification.width}
            height={notification.height}
          />
        )
      );
    }
  })
);

module.exports = Notification;
