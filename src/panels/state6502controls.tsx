import React from "react";
import { handleGetRunMode, handleGetState6502, passSetState6502 } from "../main2worker";
import { RUN_MODE, toHex } from "../emulator/utility/utility";

type KEYS = 'PC' | 'Accum' | 'XReg' | 'YReg' | 'StackPtr' | 'flagIRQ'

const State6502Controls = () => {
  const handleTextFieldChange = (e: React.ChangeEvent<HTMLInputElement>, key: KEYS) => {
    const newvalue = e.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase()
    const nv = newvalue.slice(key === 'PC' ? -4 : -2)
    const intValue = parseInt(nv || '0', 16)
    const s6502 = handleGetState6502()
    switch (key) {
      case 'PC': s6502.PC = intValue; break
      case 'Accum': s6502.Accum = intValue; break
      case 'XReg': s6502.XReg = intValue; break
      case 'YReg': s6502.YReg = intValue; break
      case 'StackPtr': s6502.StackPtr = intValue; break
      case 'flagIRQ': s6502.flagIRQ = intValue; break
    }
    passSetState6502(s6502)
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>, bitField: number) => {
    const newvalue = e.target.checked
    const s6502 = handleGetState6502()
    if (e.target.id === 'NMI') {
      s6502.flagNMI = newvalue
    } else {
      s6502.PStatus = newvalue ? s6502.PStatus | (1 << bitField) :
        s6502.PStatus & ~(1 << bitField)
    }
    passSetState6502(s6502)
  }

  const createTextField = (name: string, key: KEYS, value: number, runMode: RUN_MODE) => {
    const strVal = toHex(value)
    return (
      <div className="flex-row" style={{ alignItems: "center" }}>
        <div className="centered-title">{name}</div>
        <input type="text"
          className={name === 'PC' ? "hex-field" : "hex-field smallField"}
          disabled={runMode !== RUN_MODE.PAUSED}
          value={strVal}
          onChange={(e) => handleTextFieldChange(e, key)}
        />
      </div>
    )
  }

  const createCheckbox = (name: string, bitField: number, value: number, runMode: RUN_MODE) => {
    const checked = (value & (1 << bitField)) !== 0
    return <div className="flex-column">
      <div className="centered-title">{name}</div>
      <input type="checkbox" id={name}
        className="debugCheckbox"
        checked={checked}
        disabled={runMode !== RUN_MODE.PAUSED}
        onChange={(e) => handleCheckboxChange(e, bitField)}
      />
    </div>
  }

  const runMode = handleGetRunMode()
  const s6502 = handleGetState6502()
  return (
    <div className="flex-column" style={{ gap: "5px" }}>
      <div className="flex-row-space-between">
        {createTextField('PC', 'PC', s6502.PC, runMode)}
        {createTextField('A', 'Accum', s6502.Accum, runMode)}
        {createTextField('X', 'XReg', s6502.XReg, runMode)}
        {createTextField('Y', 'YReg', s6502.YReg, runMode)}
        {createTextField('S', 'StackPtr', s6502.StackPtr, runMode)}
        {createTextField('IRQ', 'flagIRQ', s6502.flagIRQ, runMode)}
      </div>
      <div className="flex-row-space-between">
        <div className="flex-row">
          {createCheckbox('N', 7, s6502.PStatus, runMode)}
          {createCheckbox('V', 6, s6502.PStatus, runMode)}
          {createCheckbox('B', 4, s6502.PStatus, runMode)}
          {createCheckbox('D', 3, s6502.PStatus, runMode)}
          {createCheckbox('I', 2, s6502.PStatus, runMode)}
          {createCheckbox('Z', 1, s6502.PStatus, runMode)}
          {createCheckbox('C', 0, s6502.PStatus, runMode)}
        </div>
        <div className="flex-row">
          {createCheckbox('NMI', 0, s6502.flagNMI ? 1 : 0, runMode)}
        </div>
      </div>
    </div>
  )
}

export default State6502Controls;
