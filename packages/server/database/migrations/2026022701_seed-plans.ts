/**
 * Migration: Seed Plans
 * Creates initial subscription plans for the property management system
 */

interface MigrationContext {
  knex: any
  strapi: any
}

async function up({ strapi }: MigrationContext) {
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      price: 1490,
      currency: 'THB',
      maxProperties: 1,
      maxUnitsPerProperty: 200,
      maxUnitTypesPerProperty: 5,
      maxBuildingsPerProperty: 1,
      features: JSON.stringify([
        'Up to 1 property',
        'Up to 200 units per property',
        'Up to 5 unit types per property',
        'Up to 1 building per property',
        'Basic messaging',
        'Maintenance requests',
        'Payment tracking',
      ]),
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Professional',
      slug: 'professional',
      price: 3480,
      currency: 'THB',
      maxProperties: 3,
      maxUnitsPerProperty: 200,
      maxUnitTypesPerProperty: 10,
      maxBuildingsPerProperty: 3,
      features: JSON.stringify([
        'Up to 3 properties',
        'Up to 200 units per property',
        'Up to 10 unit types per property',
        'Up to 3 buildings per property',
        'Advanced messaging',
        'Maintenance requests',
        'Payment tracking',
        'Announcements',
        'Asset management',
      ]),
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      price: 6470,
      currency: 'THB',
      maxProperties: 5,
      maxUnitsPerProperty: 300,
      maxUnitTypesPerProperty: 20,
      maxBuildingsPerProperty: 10,
      features: JSON.stringify([
        'Up to 5 properties',
        'Up to 300 units per property',
        'Up to 20 unit types per property',
        'Up to 10 buildings per property',
        'Priority support',
        'Advanced messaging',
        'Maintenance requests',
        'Payment tracking',
        'Announcements',
        'Asset management',
        'Custom reports',
      ]),
      isActive: true,
      sortOrder: 3,
    },
  ]

  for (const planData of plans) {
    // Check if plan already exists
    const existing = await strapi.documents('api::plan.plan').findMany({
      filters: { slug: { $eq: planData.slug } },
      limit: 1,
    })

    if (existing.length === 0) {
      await strapi.documents('api::plan.plan').create({
        data: planData,
        status: 'published',
      })
      strapi.log.info(`[Migration] Created plan: ${planData.name}`)
    } else {
      strapi.log.info(`[Migration] Plan already exists: ${planData.name}`)
    }
  }
}

async function down({ strapi }: MigrationContext) {
  const slugs = ['starter', 'professional', 'enterprise']

  for (const slug of slugs) {
    const plans = await strapi.documents('api::plan.plan').findMany({
      filters: { slug: { $eq: slug } },
    })

    for (const plan of plans) {
      await strapi.documents('api::plan.plan').delete({
        documentId: plan.documentId,
      })
    }
  }
}

export { up, down }
