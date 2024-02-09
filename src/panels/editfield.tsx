import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWarning
} from "@fortawesome/free-solid-svg-icons";

interface EditFieldProps {
  name: string;
  value: string;
  setValue: (v: string) => void;
  placeholder?: string;
  width?: string;
  help?: string;
  warning?: string;
}

const EditField = (props: EditFieldProps) => {
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.setValue(e.target.value)
  }
  return (
    <div className="flex-row" style={{ marginTop: '2px', position: "relative" }}>
      <div className="white-title">{props.name}</div>
      <input type="text"
        className="dark-mode-edit mono-text"
        placeholder={props.placeholder}
        value={props.value}
        style={{ width: props.width || "100%" }}
        onChange={(e) => handleValueChange(e)} />
      {props.warning &&
        <div className="warning-div flex-row">
          <FontAwesomeIcon icon={faWarning}
            className="warning-icon"
            title={props.warning} />
          <div className="warning-text">{props.warning}</div>
        </div>}
      {(props.help && !props.warning) &&
        <div className="warning-div flex-row">
          <div className="warning-text" style={{ color: "#ccc" }}>{props.help}</div>
        </div>}
    </div>
  )
}

export default EditField
