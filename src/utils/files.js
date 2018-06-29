import fs from 'fs'

const durationAlgorithm = f => {
  return fs.statSync(f).size
}

export { durationAlgorithm }
