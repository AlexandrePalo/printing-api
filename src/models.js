import Knex from 'knex'
import { Model } from 'objection'

// Initialization
const knex = Knex({
  client: 'sqlite3',
  useNullAsDefault: true,
  connection: {
    filename: 'printify-api.db'
  }
})
Model.knex(knex)

// User
class User extends Model {
  static get tableName() {
    return 'users'
  }
}

// Migrations
async function createSchema() {
  const isTableUser = await knex.schema.hasTable('users')
  if (!isTableUser) {
    console.log('create users')
    // Create first users table
    await knex.schema.createTable('users', table => {
      table.increments('id').primary()
      table.string('username')
      table.string('name')
      table.string('passwordHash')
      table.string('privateTokenRevokeKey')
    })
    await createInitialUsers()
  }
}

async function createInitialUsers() {
  await User.query().insert({
    username: 'apalo',
    name: 'Alexandre PALO',
    passwordHash:
      '018c1b59605a109a08fcd7e40e71a877d97f09405cbd2a78c153d30bb4f0540f',
    privateTokenRevokeKey: 'a0953fc7-e93c-487f-a729-2c7513f4e529'
  })
}

createSchema()

export { User }
