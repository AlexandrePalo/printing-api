import fs from 'fs'
import lineByLine from 'n-readlines'
import math from 'mathjs'

const durationAlgorithm = f => {
  /* Estimate the print duration from a gcode file
  c -> current
  n -> next
  */
  let x_c = 0
  let y_c = 0
  let z_c = 0
  let v_c = 0
  let d_c = 0

  // Sync line reader
  const liner = new lineByLine(f)
  let command

  while ((command = liner.next())) {
    // Cast buffer string
    command = command.toString('ascii')

    // Only G0 and G1
    if (isGMoveCommand(command)) {
      const params = paramsFromGCommand(command)
      let x_n = params.X ? params.X.value : x_c
      let y_n = params.Y ? params.Y.value : y_c
      let z_n = params.Z ? params.Z.value : z_c
      let v_n = params.F ? params.F.value : v_c

      d_c =
        d_c +
        moveDuration(
          moveDistance({ x: x_n, y: y_n, z: z_n }, { x: x_c, y: y_c, z: z_c }),
          v_n / 60
        )

      params.X && (x_c = params.X.value)
      params.Y && (y_c = params.Y.value)
      params.Z && (z_c = params.Z.value)
      params.F && (v_c = params.F.value)
    }
  }

  return d_c
}

const isGMoveCommand = command => {
  const re = new RegExp('G([0, 1]{1})', 'gi')
  if (command.match(re)) {
    return true
  }
  return false
}

const paramsFromGCommand = command => {
  /* Extract G, F, X, Y, Z, E info from a G0/1 command
  Usually G1 are for extrusion, but some slicers doesn't respect the convention.
  Thus, G1 and G0 are treated in the same way. */
  return {
    G: commandParamValue(command, 'G'),
    F: commandParamValue(command, 'F'),
    X: commandParamValue(command, 'X'),
    Y: commandParamValue(command, 'Y'),
    Z: commandParamValue(command, 'Z'),
    E: commandParamValue(command, 'E')
  }
}

const commandParamValue = (fullCommand, param) => {
  /* Return an object with the param command and the value */

  let re = null
  // Integer
  if (['G'].indexOf(param) !== -1) {
    re = new RegExp('(' + param + '[0-9]+)', 'gi')
  }
  // Decimal
  if (['F', 'X', 'Y', 'Z', 'E'].indexOf(param) !== -1) {
    re = new RegExp('(' + param + '[0-9.]+)', 'gi')
  }

  const raw = fullCommand.match(re)
  if (raw) {
    if (raw.length === 1) {
      return {
        command: raw[0],
        value: Number(raw[0].slice(1, raw[0].length))
      }
    }
    return {}
  }
}

const moveDistance = (i, j) => {
  return math.sqrt(
    math.square(i.x - j.x) + math.square(i.y - j.y) + math.square(i.y - j.y)
  )
}

const moveDuration = (distance, speed) => {
  // mm s
  return distance / speed
}

export { durationAlgorithm }
