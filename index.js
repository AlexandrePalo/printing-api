import { ApolloServer, gql } from 'apollo-server'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import serialport from 'serialport'
import { connectToPrinter } from './src/printer/connexion'
import { durationAlgorithm } from './src/utils/files'

let SerialPort = null

const files = [
  {
    name: 'file1',
    duration: 1000,
    date: moment().toISOString()
  }
]

// Type definitions define the "shape" of your data and specify
// which ways the data can be fetched from the GraphQL server.
const typeDefs = gql`
  type SeriePort {
    name: String
  }

  type File {
    name: String
    duration: Int
    date: String
  }

  type PrinterResponse {
    status: String
    message: String
  }

  type Query {
    serieports: [SeriePort]
    files(name: String): [File]
  }

  type Mutation {
    connectToPrinter(port: String, baudRate: Int): PrinterResponse
    readDir(dir: String): [File]
  }
`

// Resolvers define the technique for fetching the types in the
// schema.  We'll retrieve books from the "books" array above.
const resolvers = {
  Query: {
    serieports: (obj, args, context, info) => {
      return serialport.list().then((res, err) => {
        err && console.log(err)
        return res.map(r => ({
          name: r.comName
        }))
      })
    },
    files: (obj, args, context, info) => {
      if (args.name) {
        return files.filter(f => f.name === args.name)
      }
      return files
    }
  },
  Mutation: {
    connectToPrinter: (obj, args, context, info) => {
      return new Promise((resolve, reject) => {
        SerialPort = new serialport(args.port, err => {
          reject(err.message)
        })
        SerialPort.on('open', () => {
          resolve('connected')
        })
      })
        .then(message => {
          return { status: 'OK', message }
        })
        .catch(err => {
          return { status: 'ERROR', message: err }
        })
    },
    readDir: (obj, args, context, info) => {
      return new Promise((resolve, reject) => {
        fs.readdir(args.dir, (err, files) => {
          err && reject(err)
          resolve(files)
        })
      }).then(files => {
        return files.filter(f => path.extname(f) === '.gcode').map(f => ({
          name: path.basename(f, path.extname(f)),
          duration: durationAlgorithm(args.dir + '/' + f),
          date: moment(fs.statSync(args.dir + '/' + f).mtime).toISOString()
        }))
      })
    }
  }
}

const server = new ApolloServer({ typeDefs, resolvers })

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`)
})
