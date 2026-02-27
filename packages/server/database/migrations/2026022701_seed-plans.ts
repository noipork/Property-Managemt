import type { Core } from '@strapi/strapi'

export async function up({ strapi }: { strapi: Core.Strapi }) {
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      price: 1490,
      currency: 'THB',
      maxProperties: 1,
      maxUnitsPerProperty: 200,
      features: [
        'Up to 1 property',
        'Up to 200 units',
        'Basic reporting',
        'Email support',
      ],
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Professional',
      slug: 'professional',
      price: 3480, // 1490 + 1990
      currency: 'THB',
      maxProperties: 3,
      maxUnitsPerProperty: 200,
      features: [
        'Up to 3 properties',
        'Up to 200 units per property',
        'Advanced reporting',
        'Priority email support',
        'Tenant portal',
      ],
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      price: 6470, // 3480 + 2990
      currency: 'THB',
      maxProperties: 5,
      maxUnitsPerProperty: 300,
      features: [
        'Up to 5 properties',
        'Up to 300 units per property',
        'Full analytics & reporting',
        'Dedicated support',
        'Tenant portal',
        'Custom integrations',
        'API access',
      ],
      isActive: true,
      sortOrder: 3,
    },
  ]

  for (const plan of plans) {
    const existing = await strapi.db.query('api::plan.plan').findOne({
      where: { slug: plan.slug },
    })

    if (!existing) {
      await strapi.db.query('api::plan.plan').create({ data: plan })
      console.log(`✅ Created plan: ${plan.name}`)
    } else {
      console.log(`⏭️  Plan already exists: ${plan.name}`)
    }
  }
}

export async function down({ strapi }: { strapi: Core.Strapi }) {
  const slugs = ['starter', 'professional', 'enterprise']

  for (const slug of slugs) {
    await strapi.db.query('api::plan.plan').delete({ where: { slug } })
    console.log(`🗑️  Deleted plan: ${slug}`)
  }
}
