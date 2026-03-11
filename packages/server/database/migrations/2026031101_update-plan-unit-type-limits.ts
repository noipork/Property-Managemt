import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Update max_unit_types_per_property for existing plan rows that have NULL
  await knex('plans')
    .where('slug', 'starter')
    .whereNull('max_unit_types_per_property')
    .update({ max_unit_types_per_property: 5 })

  await knex('plans')
    .where('slug', 'professional')
    .whereNull('max_unit_types_per_property')
    .update({ max_unit_types_per_property: 10 })

  await knex('plans')
    .where('slug', 'enterprise')
    .whereNull('max_unit_types_per_property')
    .update({ max_unit_types_per_property: 20 })
}

export async function down(knex: Knex): Promise<void> {
  // No-op: we don't want to null out these values on rollback
}
