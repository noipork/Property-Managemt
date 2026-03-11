import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex('plans')
    .where('slug', 'starter')
    .whereNull('max_buildings_per_property')
    .update({ max_buildings_per_property: 1 })

  await knex('plans')
    .where('slug', 'professional')
    .whereNull('max_buildings_per_property')
    .update({ max_buildings_per_property: 3 })

  await knex('plans')
    .where('slug', 'enterprise')
    .whereNull('max_buildings_per_property')
    .update({ max_buildings_per_property: 10 })
}

export async function down(knex: Knex): Promise<void> {
  // No-op
}
