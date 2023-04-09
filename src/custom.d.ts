declare module "*.svg" {
   const value: any;
   export = value;
}
declare module "*.png" {
   const value: any;
   export = value;
}
declare module "*.mp3" {
   const value: any;
   export = value;
}

interface PCodeFunc {
  (valueLo: number, valueHi: number): number;
}

interface PCodeInstr {
    name: string
    pcode: number,
    mode: MODE
    PC: number
    execute: PCodeFunc
}

type STATE6502 = {
  PStatus: number,
  PC: number,
  Accum: number,
  XReg: number,
  YReg: number,
  StackPtr: number
}

type SAVEAPPLE2STATE = {
  s6502: STATE6502
  softSwitches: {[name: string]: boolean}
  memory: string
  memAux: string
  memc000: string
}

type DisplayProps = {
  machineState: STATE,
  speed: string,
  myCanvas: React.RefObject<HTMLCanvasElement>,
  speedCheck: boolean,
  handleSpeedChange: () => void,
  uppercase: boolean,
  isColor: boolean,
  sendKey: (key: number) => void,
  handleColorChange: () => void,
  handleCopyToClipboard: () => void,
  handleUpperCaseChange: () => void,
  handleFileOpen: () => void,
  handleFileSave: () => void,
  button0: boolean,
  button1: boolean,
}

type DebugProps = {
  doDebug: boolean,
  breakpoint: string,
  handleDebugChange: () => void,
  handleBreakpoint: (bp: string) => void,
  handleStepInto: () => void,
  handleStepOver: () => void,
  handleStepOut: () => void,
}

type MachineState = {
  state: STATE,
  speed: number,
  altChar: boolean,
  textPage: Uint8Array,
  lores: Uint8Array,
  hires: Uint8Array,
  zeroPageStack: string,
  button0: boolean,
  button1: boolean
}

type DriveState = {
  hardDrive: boolean,
  status: string,
  filename: string,
  diskHasChanges: boolean,
  motorRunning: boolean,
  isWriteProtected: boolean,
  halftrack: number,
  prevHalfTrack: number,
  writeMode: boolean,
  currentPhase: number,
  trackStart: Array<number>,
  trackNbits: Array<number>,
  trackLocation: number,
}

type DriveProps = {
  hardDrive: boolean,
  drive: number,
  filename: string,
  status: string,
  motorRunning: boolean,
  diskHasChanges: boolean,
  diskData: Uint8Array
}
//  readDisk: (file: File, drive: number) => void,
//  resetDrive: (drive: number) => void,

type AudioDevice = {
  context: AudioContext,
  element: HTMLAudioElement
}

type EmuGamepad = {
  connected: boolean,
  axes: Array<number>,
  buttons: Array<boolean>
}
