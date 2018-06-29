import serialport from 'serialport'
let SerialPort = null

const connectToPrinter = (port, baudRate) => {
  SerialPort = new serialport(port, {
    autoOpen: false
  })
  SerialPort.open(err => {
    return { status: 'ERROR', message: err }
  })
}

export { connectToPrinter }
