import React from "react"
import { Buffer } from "buffer"
import { toHex } from "./utility"
import { SWITCHES } from "./softswitches"
import { cycleCount } from './instructions'
import { uint32toBytes } from "./utility"
import { convertdsk2woz } from "./convertdsk2woz"
import disk2off from './img/disk2off.png'
import disk2on from './img/disk2on.png'
import disk2offEmpty from './img/disk2off-empty.png'
import disk2onEmpty from './img/disk2on-empty.png'
import driveMotor from './audio/driveMotor.mp3'
import driveTrackOffEnd from './audio/driveTrackOffEnd.mp3'
import driveTrackSeek from './audio/driveTrackSeekLong.mp3'

const emptyDisk = "(empty)"
let doDebugDrive = false

const initDriveData = (): DriveData => {
  return {
    fileName: emptyDisk,
    diskData: new Uint8Array(),
    halftrack: 0,
    prevHalfTrack: 0,
    writeMode: false,
    currentPhase: 0,
    diskImageHasChanges: false,
    motorIsRunning: false,
    trackStart: Array<number>(80),
    trackNbits: Array<number>(80),
    trackLocation: 0,
    isWriteProtected: false
  }
}
let driveData: DriveData[] = [initDriveData(), initDriveData()];
let currentDrive = 0;

export const getFilename = (diskDrive: number) => {
  if (driveData[diskDrive].fileName !== emptyDisk) {
    let f = driveData[diskDrive].fileName
    const i = f.lastIndexOf('.')
    if (i > 0) {
      f = f.substring(0, i)
    }
    return f
  }
  return null
}

export const getDriveState = () => {
  const data = Buffer.from(driveData[currentDrive].diskData).toString('base64')
  return { dState: driveData[currentDrive], data: data }
}

export const setDriveState = (newState: any) => {
  driveData[currentDrive] = newState.dState
  driveData[currentDrive].diskData = Buffer.from(newState.data, 'base64')
}

let motorContext: AudioContext | undefined
let motorElement: HTMLAudioElement | undefined
let trackSeekContext: AudioContext | undefined
let trackSeekElement: HTMLAudioElement | undefined
let trackOffEndContext: AudioContext | undefined
let trackOffEndElement: HTMLAudioElement | undefined
let trackTimeout = 0

export const doResetDrive = () => {
  SWITCHES.DRIVE.isSet = false
  doMotorTimeout()
  driveData[0].halftrack = 68
  driveData[0].prevHalfTrack = 68
  driveData[1].halftrack = 68
  driveData[1].prevHalfTrack = 68
}

export const doPauseDrive = (resume = false) => {
  if (resume) {
    if (driveData[currentDrive].motorIsRunning) {
      startMotor()
    }
  } else {
    motorElement?.pause()
  }
}

const playTrackOutOfRange = () => {
  if (!trackOffEndContext) {
    trackOffEndContext = new AudioContext();
    trackOffEndElement = new Audio(driveTrackOffEnd);
    trackOffEndElement.volume = 0.5
    const node = trackOffEndContext.createMediaElementSource(trackOffEndElement);
    node.connect(trackOffEndContext.destination);
  }
  if (trackOffEndContext.state === 'suspended') {
    trackOffEndContext.resume();
  }
  if (!trackOffEndElement?.paused) {
    window.clearTimeout(trackTimeout)
    trackTimeout = window.setTimeout(() => trackOffEndElement?.pause(), 309);
    return
  }
  const playPromise = trackOffEndElement?.play();
  if (playPromise) {
    playPromise.then(function() {
      window.clearTimeout(trackTimeout)
      trackTimeout = window.setTimeout(() => trackOffEndElement?.pause(), 309);

    }).catch(function(error) {
      console.log(error)
    });
  }
}

const playTrackSeek = () => {
  if (!trackSeekContext) {
    trackSeekContext = new AudioContext();
    trackSeekElement = new Audio(driveTrackSeek);
    trackSeekElement.volume = 0.75
    const node = trackSeekContext.createMediaElementSource(trackSeekElement);
    node.connect(trackSeekContext.destination);
  }
  if (trackSeekContext.state === 'suspended') {
    trackSeekContext.resume();
  }
  if (!trackSeekElement?.paused) {
    window.clearTimeout(trackTimeout)
    trackTimeout = window.setTimeout(() => trackSeekElement?.pause(), 50);
    return
  }
  const playPromise = trackSeekElement?.play();
  if (playPromise) {
    playPromise.then(function() {
      window.clearTimeout(trackTimeout)
      trackTimeout = window.setTimeout(() => trackSeekElement?.pause(), 50);

    }).catch(function(error) {
      console.log(error)
    });
  }
}

const moveHead = (offset: number) => {
  const dd = driveData[currentDrive]
  if (dd.trackStart[dd.halftrack] > 0) {
    dd.prevHalfTrack = dd.halftrack
  }
  dd.halftrack += offset
  if (dd.halftrack < 0 || dd.halftrack > 68) {
    playTrackOutOfRange()
    dd.halftrack = (dd.halftrack < 0) ? 0 : (dd.halftrack > 68 ? 68 : dd.halftrack)
  } else {
    playTrackSeek()
  }
  // Adjust new track location based on arm position relative to old track loc.
  if (dd.trackStart[dd.halftrack] > 0 && dd.prevHalfTrack !== dd.halftrack) {
    // const oldloc = dState.trackLocation
    dd.trackLocation = Math.floor(dd.trackLocation * (dd.trackNbits[dd.halftrack] / dd.trackNbits[dd.prevHalfTrack]))
    if (dd.trackLocation > 3) {
      dd.trackLocation -= 4
    }
  }
}

const pickbit = [128, 64, 32, 16, 8, 4, 2, 1]
const clearbit = [0b01111111, 0b10111111, 0b11011111, 0b11101111,
  0b11110111, 0b11111011, 0b11111101, 0b11111110]

const getNextBit = () => {
  const dd = driveData[currentDrive]
  dd.trackLocation = dd.trackLocation % dd.trackNbits[dd.halftrack]
  let bit: number
  if (dd.trackStart[dd.halftrack] > 0) {
    const fileOffset = dd.trackStart[dd.halftrack] + (dd.trackLocation >> 3)
    const byte = dd.diskData[fileOffset]
    const b = dd.trackLocation & 7
    bit = (byte & pickbit[b]) >> (7 - b)
  } else {
    // TODO: Freak out like a MC3470 and return random bits
    bit = 1
  }
  dd.trackLocation++
  return bit
}

const getNextByte = () => {
  if (driveData[currentDrive].diskData.length === 0) {
    return 0
  }
  let result = 0
  let bit = 0
  while (bit === 0) {
    bit = getNextBit()
  }
  result = 0x80   // the bit we just retrieved is the high bit
  for (let i = 6; i >= 0; i--) {
    result |= getNextBit() << i
  }
  // if (doDebugDrive) {
  //   console.log(" dState.trackLocation=" + dState.trackLocation +
  //     "  byte=" + toHex(result))
  // }
  return result
}

let dataRegister = 0
let prevCycleCount = 0

const doWriteBit = (bit: 0 | 1) => {
  const dd = driveData[currentDrive]
  dd.trackLocation = dd.trackLocation % dd.trackNbits[dd.halftrack]
  // TODO: What about writing to empty tracks?
  if (dd.trackStart[dd.halftrack] > 0) {
    const fileOffset = dd.trackStart[dd.halftrack] + (dd.trackLocation >> 3)
    let byte = dd.diskData[fileOffset]
    const b = dd.trackLocation & 7
    if (bit) {
      byte |= pickbit[b]
    } else {
      byte &= clearbit[b]
    }
    dd.diskData[fileOffset] = byte
  }
  dd.trackLocation++
}

const doWriteByte = (delta: number) => {
  const dd = driveData[currentDrive]
  // Sanity check to make sure we aren't on an empty track. Is this correct?
  if (dd.diskData.length === 0 || dd.trackStart[dd.halftrack] === 0) {
    return
  }
  if (dataRegister > 0) {
    if (delta >= 16) {
      for (let i = 7; i >= 0; i--) {
        doWriteBit(dataRegister & 2**i ? 1 : 0)      
      }
    }
    if (delta >= 36) {
      doWriteBit(0)
    }
    if (delta >= 40) {
      doWriteBit(0)
    }
    debugCache.push(delta >= 40 ? 2 : delta >= 36 ? 1 : dataRegister)
    dd.diskImageHasChanges = true
    dataRegister = 0
  }
}

let debugCache:number[] = []

const dumpData = (addr: number) => {
  if (dataRegister !== 0) {
    console.error(`addr=${toHex(addr)} writeByte= ${dataRegister}`)
  }
  if (debugCache.length > 0 && driveData[currentDrive].halftrack === 2 * 0x00) {
    if (doDebugDrive) {
      let output = `TRACK ${toHex(driveData[currentDrive].halftrack/2)}: `
      let out = ''
      debugCache.forEach(element => {
        switch (element) {
          case 1: out = 'Ff'; break;
          case 2: out = 'FF'; break;
          default: out = element.toString(16); break;
        }
        output += out + ' '
      });
      console.log(output)
    }
    debugCache = []
  }
}

export const handleDriveSoftSwitches =
  (addr: number, value: number): number => {
  const dd = driveData[currentDrive]
  let result = 0
  const delta = cycleCount - prevCycleCount
  if (doDebugDrive && value !== 0x96) {
    const dc = (delta < 100) ? `  deltaCycles=${delta}` : ''
    const wb = (dataRegister > 0) ? `  writeByte=$${toHex(dataRegister)}` : ''
    const v = (value > 0) ? `  value=$${toHex(value)}` : ''
    console.log(`write ${dd.writeMode}  addr=$${toHex(addr)}${dc}${wb}${v}`)
  }
  if (addr === SWITCHES.DRIVE.onAddr) {  // $C089
    startMotor()
    dumpData(addr)
    return result
  }
  if (addr === SWITCHES.DRIVE.offAddr) {  // $C088
    stopMotor()
    dumpData(addr)
    return result
  }
  if (addr === SWITCHES.DRVSEL.offAddr) {  // $C08A
    if (driveData[1].motorIsRunning) {
      driveData[1].motorIsRunning = false
      driveData[0].motorIsRunning = true
    }
    currentDrive = 0
    return result
  }
  if (addr === SWITCHES.DRVSEL.onAddr) {  // $C08B
    if (driveData[0].motorIsRunning) {
      driveData[0].motorIsRunning = false
      driveData[1].motorIsRunning = true
    }
    currentDrive = 1
    return result
  }
  const ps = [SWITCHES.DRVSM0, SWITCHES.DRVSM1,
    SWITCHES.DRVSM2, SWITCHES.DRVSM3]
  const a = addr - SWITCHES.DRVSM0.offAddr
  // One of the stepper motors has been turned on or off
  if (a >= 0 && a <= 7) {
    const ascend = ps[(dd.currentPhase + 1) % 4]
    const descend = ps[(dd.currentPhase + 3) % 4]
    // Make sure our current phase motor has been turned off.
    if (!ps[dd.currentPhase].isSet) {
      if (dd.motorIsRunning && ascend.isSet) {
        moveHead(1)
        dd.currentPhase = (dd.currentPhase + 1) % 4

      } else if (dd.motorIsRunning && descend.isSet) {
        moveHead(-1)
        dd.currentPhase = (dd.currentPhase + 3) % 4
      }
    }
    // if (doDebugDrive) {
    //   const phases = `${ps[0].isSet ? 1 : 0}${ps[1].isSet ? 1 : 0}` +
    //     `${ps[2].isSet ? 1 : 0}${ps[3].isSet ? 1 : 0}`
    //   console.log(`***** PC=${toHex(s6502.PC,4)}  addr=${toHex(addr,4)} ` +
    //     `phase ${a >> 1} ${a % 2 === 0 ? "off" : "on "}  ${phases}  ` +
    //     `track=${dState.halftrack / 2}`)
    // }
    dumpData(addr)
  } else if (addr === SWITCHES.DRVWRITE.offAddr) {  // $C08E READ
    if (dd.motorIsRunning && dd.writeMode) {
      doWriteByte(delta)
      // Reset the Disk II Logic State Sequencer clock
      prevCycleCount = cycleCount
    }
    dd.writeMode = false
    if (SWITCHES.DRVDATA.isSet) {
      result = dd.isWriteProtected ? 0xFF : 0
    }
    dumpData(addr)
  } else if (addr === SWITCHES.DRVWRITE.onAddr) {  // $C08F WRITE
    dd.writeMode = true
    // Reset the Disk II Logic State Sequencer clock
    prevCycleCount = cycleCount
    if (value >= 0) {
      dataRegister = value
    }
  } else if (addr === SWITCHES.DRVDATA.offAddr) {  // $C08C SHIFT/READ
    if (dd.motorIsRunning) {
      if (!dd.writeMode) {
        result = getNextByte()
      }
    }
  } else if (addr === SWITCHES.DRVDATA.onAddr) {  // $C08D LOAD/READ
    if (dd.motorIsRunning) {
      if (dd.writeMode) {
        doWriteByte(delta)
        // Reset the Disk II Logic State Sequencer clock
        prevCycleCount = cycleCount
      }
      if (value >= 0) {
        dataRegister = value
      }
    }
  }

  return result
}

let crcTable = new Uint32Array(256).fill(0)

const makeCRCTable = () => {
  let c;
  for (let n =0; n < 256; n++) {
    c = n;
    for (let k =0; k < 8; k++) {
      c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[n] = c;
  }
}

const crc32 = (data: Uint8Array, offset = 0) => {
  if (crcTable[255] === 0) {
    makeCRCTable()
  }
  let crc = 0 ^ (-1);
  for (let i = offset; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }

  return (crc ^ (-1)) >>> 0;
};

const decodeWoz2 = (diskDrive: number): boolean => {
  const woz2 = [0x57, 0x4F, 0x5A, 0x32, 0xFF, 0x0A, 0x0D, 0x0A]
  const isWoz2 = woz2.find((value, i) => value !== driveData[diskDrive].diskData[i]) === undefined
  if (!isWoz2) return false
  driveData[diskDrive].isWriteProtected = driveData[diskDrive].diskData[22] === 1
  const crc = driveData[diskDrive].diskData.slice(8, 12)
  const storedCRC = crc[0] + (crc[1] << 8) + (crc[2] << 16) + crc[3] * (2 ** 24)
  const actualCRC = crc32(driveData[diskDrive].diskData, 12)
  if (storedCRC !== 0 && storedCRC !== actualCRC) {
    alert("CRC checksum error: " + driveData[diskDrive].fileName)
    return false
  }
  for (let htrack=0; htrack < 80; htrack++) {
    const tmap_index = driveData[diskDrive].diskData[88 + htrack * 2]
    if (tmap_index < 255) {
      const tmap_offset = 256 + 8 * tmap_index
      const trk = driveData[diskDrive].diskData.slice(tmap_offset, tmap_offset + 8)
      driveData[diskDrive].trackStart[htrack] = 512*(trk[0] + (trk[1] << 8))
      // const nBlocks = trk[2] + (trk[3] << 8)
      driveData[diskDrive].trackNbits[htrack] = trk[4] + (trk[5] << 8) + (trk[6] << 16) + trk[7] * (2 ** 24)
    } else {
      driveData[diskDrive].trackStart[htrack] = 0
      driveData[diskDrive].trackNbits[htrack] = 51200
//        console.log(`empty woz2 track ${htrack / 2}`)
    }
  }
  return true
}

const decodeWoz1 = (diskDrive: number): boolean => {
  const woz1 = [0x57, 0x4F, 0x5A, 0x31, 0xFF, 0x0A, 0x0D, 0x0A]
  const isWoz1 = woz1.find((value, i) => value !== driveData[diskDrive].diskData[i]) === undefined
  if (!isWoz1) {
    return false
  }
  driveData[diskDrive].isWriteProtected = driveData[diskDrive].diskData[22] === 1
  for (let htrack=0; htrack < 80; htrack++) {
    const tmap_index = driveData[diskDrive].diskData[88 + htrack * 2]
    if (tmap_index < 255) {
      driveData[diskDrive].trackStart[htrack] = 256 + tmap_index * 6656
      const trk = driveData[diskDrive].diskData.slice(driveData[diskDrive].trackStart[htrack] + 6646, driveData[diskDrive].trackStart[htrack] + 6656)
      driveData[diskDrive].trackNbits[htrack] = trk[2] + (trk[3] << 8)
    } else {
      driveData[diskDrive].trackStart[htrack] = 0
      driveData[diskDrive].trackNbits[htrack] = 51200
//        console.log(`empty woz1 track ${htrack / 2}`)
    }
  }
  return true
}

const decodeDSK = (diskDrive: number) => {
  const f = driveData[diskDrive].fileName.toUpperCase()
  const isDSK = f.endsWith(".DSK") || f.endsWith(".DO")
  const isPO = f.endsWith(".PO")
  if (!isDSK && !isPO) return false
  driveData[diskDrive].diskData = convertdsk2woz(driveData[diskDrive].diskData, isPO)
  if (driveData[diskDrive].diskData.length === 0) return false
  driveData[diskDrive].fileName = getFilename(diskDrive) + '.woz'
  driveData[diskDrive].diskImageHasChanges = true
  return decodeWoz2(diskDrive)
}

const decodeDiskData = (diskDrive: number): boolean => {
  driveData[diskDrive].diskImageHasChanges = false
  if (decodeWoz2(diskDrive)) {
    return true
  }
  if (decodeWoz1(diskDrive)) {
    return true
  }
  if (decodeDSK(diskDrive)) {
    return true
  }
  console.error("Unknown disk format.")
  driveData[diskDrive].diskData = new Uint8Array()
  return false
}

const doMotorTimeout = () => {
  if (!SWITCHES.DRIVE.isSet) {
    driveData[currentDrive].motorIsRunning = false
    motorElement?.pause()
  }
}

const startMotor = () => {
  driveData[currentDrive].motorIsRunning = true
  if (!motorContext) {
    motorContext = new AudioContext();
    motorElement = new Audio(driveMotor);
    motorElement.loop = true
    motorElement.volume = 0.5
    document.body.appendChild(motorElement);
    const node = motorContext.createMediaElementSource(motorElement);
    node.connect(motorContext.destination);
  }
  if (!motorElement) {
    return
  }
  if (motorContext.state === 'suspended') {
    motorContext.resume();
  }
  if (!motorElement.paused) {
    return
  }
  motorElement.play();
}

const stopMotor = () => {
  window.setTimeout(() => doMotorTimeout(), 1000);
}

class DiskDrive extends React.Component<{}, {fileName: string}> {

  // Hidden file input element
  hiddenFileInput1: HTMLInputElement | null = null;
  hiddenFileInput2: HTMLInputElement | null = null;
  // https://medium.com/@650egor/simple-drag-and-drop-file-upload-in-react-2cb409d88929
  handleDrop = (e: any) => {this.dropHandler(e as DragEvent)}
  handleDrag = (e: DragEvent) => 
    {e.preventDefault(); e.stopPropagation()}

  constructor(props: any) {
    super(props);
    this.state = { fileName: emptyDisk };
  }

  componentDidMount() {
    window.addEventListener('drop', this.handleDrop)
    window.addEventListener('dragover', this.handleDrag)
  }

  componentWillUnmount() {
    window.removeEventListener('drop', this.handleDrop)
    window.removeEventListener('dragover', this.handleDrag)
  }

  readDisk = async (file: File, diskDrive: number) => {
    const buffer = await file.arrayBuffer();
    driveData[diskDrive].diskData = new Uint8Array(buffer);
    driveData[diskDrive].fileName = file.name
    if (!decodeDiskData(diskDrive)) {
      driveData[diskDrive].fileName = emptyDisk
    }
    this.forceUpdate()
  }

  handleDiskClick1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target?.files?.length) {
      this.readDisk(e.target.files[0], 0)
    }
  };

  handleDiskClick2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target?.files?.length) {
      this.readDisk(e.target.files[0], 1)
    }
  };

  downloadDisk = (diskDrive: number) => {
    const crc = crc32(driveData[diskDrive].diskData, 12)
    driveData[diskDrive].diskData.set(uint32toBytes(crc), 8)
    const blob = new Blob([driveData[diskDrive].diskData]);
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', driveData[diskDrive].fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  dropHandler = (e: DragEvent) => {    
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer?.files
    if (f && f.length > 0) {
      this.readDisk(f[0], 0)
    }
  }

  render() {
    const img1 = (driveData[0].diskData.length > 0) ?
      (driveData[0].motorIsRunning ? disk2on : disk2off) :
      (driveData[0].motorIsRunning ? disk2onEmpty : disk2offEmpty)
    const img2 = (driveData[1].diskData.length > 0) ?
      (driveData[1].motorIsRunning ? disk2on : disk2off) :
      (driveData[1].motorIsRunning ? disk2onEmpty : disk2offEmpty)
    return (
      <span>
        <span>
        <img className="disk2" src={img1} alt={driveData[0].fileName}
          title={driveData[0].fileName}
          onClick={() => {
            if (driveData[0].diskData.length > 0) {
              if (driveData[0].diskImageHasChanges) {
                this.downloadDisk(0)
              }
              driveData[0].diskData = new Uint8Array()
              driveData[0].fileName = emptyDisk
              this.forceUpdate()
            } else {
              if (this.hiddenFileInput1) {
                // Hack - clear out old file so we can pick the same file again
                this.hiddenFileInput1.value = "";
                this.hiddenFileInput1.click()
              }
            }
          }} />
        <input
          type="file"
          ref={input => this.hiddenFileInput1 = input}
          onChange={this.handleDiskClick1}
          style={{display: 'none'}}
        />
        <img className="disk2" src={img2} alt={driveData[1].fileName}
          title={driveData[1].fileName}
          onClick={() => {
            if (driveData[1].diskData.length > 0) {
              if (driveData[1].diskImageHasChanges) {
                this.downloadDisk(1)
              }
              driveData[1].diskData = new Uint8Array()
              driveData[1].fileName = emptyDisk
              this.forceUpdate()
            } else {
              if (this.hiddenFileInput2) {
                // Hack - clear out old file so we can pick the same file again
                this.hiddenFileInput2.value = "";
                this.hiddenFileInput2.click()
              }
            }
          }} />
        <input
          type="file"
          ref={input => this.hiddenFileInput2 = input}
          onChange={this.handleDiskClick2}
          style={{display: 'none'}}
        />
        </span>
        <br/>
        <span className="fixed">{driveData[0].halftrack / 2}</span>
      </span>
    );
  }
}

export default DiskDrive;
