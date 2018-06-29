import { ApolloServer, gql } from 'apollo-server'
import moment from 'moment'

// This is a (sample) collection of books we'll be able to query
// the GraphQL server for.  A more complete example might fetch
// from an existing data source like a REST API or database.
const serieports = [
  {
    name: '/dev/tty1'
  },
  {
    name: '/dev/tty2'
  }
]

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

  type Query {
    serieports: [SeriePort]
    files: [File]
  }
`

// Resolvers define the technique for fetching the types in the
// schema.  We'll retrieve books from the "books" array above.
const resolvers = {
  Query: {
    serieports: () => serieports,
    files: () => files
  }
}

// In the most basic sense, the ApolloServer can be started
// by passing type definitions (typeDefs) and the resolvers
// responsible for fetching the data for those types.
const server = new ApolloServer({ typeDefs, resolvers })

// This `listen` method launches a web-server.  Existing apps
// can utilize middleware options, which we'll discuss later.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`)
})
