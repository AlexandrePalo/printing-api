import { ApolloServer, gql } from 'apollo-server'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import serialport from 'serialport'
import forge from 'node-forge'
import { connectToPrinter } from './src/printer/connexion'
import { durationAlgorithm } from './src/utils/files'
import uuidv4 from 'uuid/v4'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const privateKey = process.env.PRIVATEKEY

import { User } from './src/models'

let SerialPort = null
const uploadDir = __dirname + '/public/3D'

const getObjectInArray = (arr, id) => {
  let object = null
  arr.forEach(e => {
    if (e.id === id) {
      object = e
    }
  })
  return object
}

const typeDefs = gql`
  type User {
    username: String
    passwordHash: String
    name: String
    id: String
  }

  type JWT {
    token: String
  }

  type SeriePort {
    name: String
  }

  type File {
    path: String
    duration: Int
    date: String
  }

  type PrinterResponse {
    status: String
    message: String
  }

  type Query {
    serieports: [SeriePort]
  }

  type Mutation {
    login(username: String, password: String): JWT
    reLogin(token: String): User
    connectToPrinter(port: String, baudRate: Int): PrinterResponse
    readDir: [File]
    deleteFile(path: String): File
    addFile(file: Upload): File
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
        fs.readdir(uploadDir, (err, files) => {
          err && reject(err)
          resolve(files)
        })
      }).then(files => {
        // Authorization
        if (!context.user) {
          throw new Error('not authorized')
        }

        return files.filter(f => path.extname(f) === '.gcode').map(f => {
          return {
            path: uploadDir + '/' + f,
            duration: Math.round(durationAlgorithm(uploadDir + '/' + f)),
            date: moment(fs.statSync(uploadDir + '/' + f).mtime).toISOString()
          }
        })
      })
    },
    deleteFile: (obj, args, context, info) => {
      return new Promise((resolve, reject) => {
        // Authorization
        if (!context.user) {
          throw new Error('not authorized')
        }

        const deletedFile = {
          name: args.path,
          duration: durationAlgorithm(args.path),
          date: moment(fs.statSync(args.path).mtime).toISOString()
        }

        fs.unlink(args.path, err => {
          err && reject(err)
          resolve(deletedFile)
        })
      }).then(file => {
        return file
      })
    },
    addFile: async (obj, args, context, info) => {
      // Get file input
      const input = await args.file

      // Save into server
      const id = uuidv4()
      const uploadFilename = `${id}-${input.filename}`
      const path = `${uploadDir}/${uploadFilename}`

      return new Promise((resolve, reject) =>
        input.stream
          .on('error', error => {
            if (input.stream.truncated)
              // Delete the truncated file
              fs.unlinkSync(path)
            reject(error)
          })
          .pipe(fs.createWriteStream(path))
          .on('error', error => reject(error))
          .on('finish', () => resolve())
      )
        .then(() => {
          return {
            path: uploadDir + '/' + uploadFilename,
            duration: Math.round(
              durationAlgorithm(uploadDir + '/' + uploadFilename)
            ),
            date: moment(
              fs.statSync(uploadDir + '/' + uploadFilename).mtime
            ).toISOString()
          }
        })
        .catch(err => {
          return {
            path: null,
            duration: null,
            date: null
          }
        })
    },
    login: (obj, args, context, info) => {
      return new Promise((resolve, reject) => {
        // Check if user exist with username
        let user = null
        User.query()
          .where('username', args.username)
          .then(users => {
            if (users.length === 1) {
              user = users[0]

              let hash = forge.md.sha256.create()
              hash.update(args.password)
              if (hash.digest().toHex() === user.passwordHash) {
                const token = jwt.sign(
                  {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    passwordHash: user.passwordHash,
                    privateTokenRevokeKey: user.privateTokenRevokeKey
                  },
                  privateKey
                )
                resolve(token)
              } else {
                reject('Bad credentials')
              }
            } else {
              reject('Bad credentials')
            }
          })
      })
        .then(token => {
          return { token }
        })
        .catch(err => {
          return { message: err }
        })
    },
    reLogin: (obj, args, context, info) => {
      return new Promise((resolve, reject) => {
        // Decode jwt and check user
        let userToken = jwt.decode(args.token)
        if (!userToken.id) {
          reject('Bad token format')
        }

        // Verify full token
        if (!jwt.verify(args.token, privateKey)) {
        }

        // Get backend user
        User.query()
          .where('id', userToken.id)
          .where('privateTokenRevokeKey', userToken.privateTokenRevokeKey)
          .limit(1)
          .first()
          .then(user => {
            // No user
            if (!user) {
              reject('User not found')
            }
            resolve(user)
          })
          .catch(err => {
            reject(err)
          })
      })
        .then(user => {
          return user
        })
        .catch(err => {
          return { message: err }
        })
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    // Authorization requested
    if (req.headers.authorization) {
      // Get token
      const token = req.headers.authorization.split(' ')[1]
      // Get user and check if exist
      const userToken = jwt.decode(token)
      if (!userToken.id) {
        throw new AuthorizationError('Bad token format')
      }

      // Backend user
      const user = await User.query()
        .where('id', userToken.id)
        .where('privateTokenRevokeKey', userToken.privateTokenRevokeKey)
        .limit(1)
        .first()

      // No user
      if (!user) {
        throw new AuthorizationError('User not found')
      }

      // Verify token
      if (!jwt.verify(token, privateKey)) {
        throw new AuthorizationError('bad token')
      }

      // Return user
      return { user }
    }
    return { user: null }
  }
})
server.appl

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`)
})
