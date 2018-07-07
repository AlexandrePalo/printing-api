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
const users = [
  {
    id: '45745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
    username: 'apalo',
    passwordHash:
      '018c1b59605a109a08fcd7e40e71a877d97f09405cbd2a78c153d30bb4f0540f',
    name: 'Alexandre PALO'
  }
]
const privateKey =
  "_a$glTa>^A]2<W/TYw43x!%4y70h?]OY]<AKQW<s~m?blH(d%PKPC'#OFoi%j"

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
        let user = null
        users.forEach(u => {
          if (u.username === args.username) {
            user = u
          }
        })
        !user && reject('Bad credentials')

        let hash = forge.md.sha256.create()
        hash.update(args.password)
        if (hash.digest().toHex() === user.passwordHash) {
          const token = jwt.sign(user, privateKey)
          resolve(token)
        } else {
          reject('Bad credentials')
        }
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
        if (!userToken.id || !users.map(u => u.id).includes(userToken.id)) {
          reject('User not found')
        }
        // Get current user in backend
        const user = getObjectInArray(users, userToken.id)
        // Verify token
        if (!jwt.verify(args.token, privateKey)) {
          reject('Bad token')
        }
        // Everything ok, send current user
        resolve(user)
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

const processUpload = async upload => {
  console.log(upload)
  const { stream, filename, mimetype, encoding } = await upload
  console.log(stream, filename, mimetype, encoding)

  const { id, path } = await storeFS({ stream, filename })
  return storeFS({ id, filename, mimetype, encoding, path })
}

const storeFS = ({ stream, filename }) => {
  const id = uuidv4()
  const path = `${uploadDir}/${id}-${filename}`
  return new Promise((resolve, reject) =>
    stream
      .on('error', error => {
        if (stream.truncated)
          // Delete the truncated file
          fs.unlinkSync(path)
        reject(error)
      })
      .pipe(fs.createWriteStream(path))
      .on('error', error => reject(error))
      .on('finish', () => resolve({ id, path }))
  )
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    // Authorization requested
    if (req.headers.authorization) {
      // Get token
      const token = req.headers.authorization.split(' ')[1]
      // Get user and check if exist
      const userToken = jwt.decode(token)
      if (!userToken.id || !users.map(u => u.id).includes(userToken.id)) {
        throw new AuthorizationError('user not found')
      }
      // Verify token
      if (!jwt.verify(token, privateKey)) {
        throw new AuthorizationError('bad token')
      }
      // Return user
      return { user: getObjectInArray(users, userToken.id) }
    }
    return { user: null }
  }
})
server.appl

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`)
})
