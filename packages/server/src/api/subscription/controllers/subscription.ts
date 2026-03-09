/**
 * subscription controller
 */

import { factories } from '@strapi/strapi'
import Stripe from 'stripe'

// Initialize Stripe with test secret key
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not defined in environment variables')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default factories.createCoreController('api::subscription.subscription', ({ strapi }) => ({
  // Create Stripe Checkout Session
  async createCheckout(ctx) {
    try {
      const user = ctx.state.user
      if (!user) {
        return ctx.unauthorized('You must be logged in')
      }

      const { planId, durationMonths = 1 } = ctx.request.body

      if (!planId) {
        return ctx.badRequest('Plan ID is required')
      }

      // Validate duration
      const validDurations = [1, 3, 6, 12]
      const duration = validDurations.includes(durationMonths) ? durationMonths : 1

      // Calculate discount based on duration
      const discountRates: Record<number, number> = {
        1: 0,    // No discount
        3: 10,   // 10% off
        6: 15,   // 15% off
        12: 20,  // 20% off
      }
      const discountPercent = discountRates[duration] || 0

      // Fetch the plan
      const plan = await strapi.documents('api::plan.plan').findOne({
        documentId: planId,
      })

      if (!plan) {
        return ctx.notFound('Plan not found')
      }

      if (!plan.isActive) {
        return ctx.badRequest('This plan is not available')
      }

      // Calculate dates based on duration
      const startDate = new Date()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + duration)

      // If plan is free, activate subscription immediately
      if (plan.price === 0) {
        // Deactivate current subscription if any
        const currentSubs = await strapi.documents('api::subscription.subscription').findMany({
          filters: { user: { id: user.id }, status: 'active' },
        })
        for (const sub of currentSubs) {
          await strapi.documents('api::subscription.subscription').update({
            documentId: sub.documentId,
            data: { status: 'cancelled' },
          })
        }

        // Create subscription
        const subscription = await strapi.documents('api::subscription.subscription').create({
          data: {
            user: user.id,
            plan: plan.id,
            status: 'active',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            amount: 0,
            currency: plan.currency || 'THB',
            paymentMethod: 'free',
            paymentStatus: 'paid',
            paidAt: new Date().toISOString(),
            invoiceNo: `INV-${Date.now()}`,
          },
        })

        // Update user's active subscription and plan
        await strapi.documents('plugin::users-permissions.user').update({
          documentId: user.documentId,
          data: {
            activeSubscription: subscription.documentId,
            plan: plan.documentId,
          },
        })

        return ctx.send({
          success: true,
          free: true,
          subscription,
        })
      }

      // Calculate total price with discount
      const baseTotal = plan.price * duration
      const discountAmount = baseTotal * (discountPercent / 100)
      let finalPrice = Math.round(baseTotal - discountAmount)

      // ─── Proration: credit remaining days on current subscription ────────
      let creditAmount = 0
      const currentSub = await strapi.documents('api::subscription.subscription').findFirst({
        filters: { user: { id: user.id }, status: 'active' },
        populate: ['plan'],
      })

      if (currentSub && currentSub.endDate && currentSub.amount > 0) {
        const now = new Date()
        const subEnd = new Date(currentSub.endDate)
        const subStart = new Date(currentSub.startDate)
        const totalDays = Math.max(1, Math.ceil((subEnd.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24)))
        const remainingDays = Math.max(0, Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        const remainingRatio = remainingDays / totalDays
        creditAmount = Math.round(currentSub.amount * remainingRatio)
      }

      finalPrice = Math.max(0, finalPrice - creditAmount)
      // ─────────────────────────────────────────────────────────────────────

      // Create or retrieve Stripe customer
      let stripeCustomerId = user.stripeCustomerId

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.username,
          metadata: {
            userId: String(user.id),
            userDocumentId: user.documentId,
          },
        })
        stripeCustomerId = customer.id
      }

      // Duration labels for display
      const durationLabels: Record<number, string> = {
        1: '1 Month',
        3: '3 Months',
        6: '6 Months',
        12: '1 Year',
      }
      const durationLabel = durationLabels[duration] || `${duration} Months`

      // Clean up any previous pending subscriptions for this user
      const pendingSubs = await strapi.documents('api::subscription.subscription').findMany({
        filters: { user: { id: user.id }, status: 'pending' },
      })
      for (const sub of pendingSubs) {
        await strapi.documents('api::subscription.subscription').delete({
          documentId: sub.documentId,
        })
      }

      // Create Stripe Checkout Session — NO pending subscription created yet
      // Subscription will only be created after successful payment in checkoutSuccess
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card', 'promptpay'],
        line_items: [
          {
            price_data: {
              currency: (plan.currency || 'THB').toLowerCase(),
              product_data: {
                name: `${plan.name} - ${durationLabel}`,
                description: `${plan.maxProperties} properties, ${plan.maxUnitsPerProperty} units per property${discountPercent > 0 ? ` (${discountPercent}% discount applied)` : ''}${creditAmount > 0 ? ` — ฿${creditAmount.toLocaleString()} credit from current plan` : ''}`,
              },
              unit_amount: Math.round(finalPrice * 100), // Stripe uses cents (satang for THB)
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/manager/packages?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/manager/packages?cancelled=true`,
        metadata: {
          type: 'upgrade',
          planId: String(plan.id),
          planDocumentId: plan.documentId,
          durationMonths: String(duration),
          amount: String(finalPrice),
          creditAmount: String(creditAmount),
          currency: plan.currency || 'THB',
          userId: String(user.id),
          userDocumentId: user.documentId,
          stripeCustomerId,
        },
      })

      return ctx.send({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
      })
    } catch (error) {
      strapi.log.error('Stripe checkout error:', error)
      return ctx.internalServerError('Failed to create checkout session')
    }
  },

  // ─── Schedule Downgrade (takes effect at end of current subscription) ────────
  async downgradePlan(ctx) {
    try {
      const user = ctx.state.user
      if (!user) {
        return ctx.unauthorized('You must be logged in')
      }

      const { planId } = ctx.request.body
      if (!planId) {
        return ctx.badRequest('Plan ID is required')
      }

      // Fetch target plan
      const plan = await strapi.documents('api::plan.plan').findOne({
        documentId: planId,
      })

      if (!plan) {
        return ctx.notFound('Plan not found')
      }

      if (!plan.isActive) {
        return ctx.badRequest('This plan is not available')
      }

      // Get current active subscription
      const currentSub = await strapi.documents('api::subscription.subscription').findFirst({
        filters: { user: { id: user.id }, status: 'active' },
        populate: ['plan', 'scheduledDowngradePlan'],
      })

      if (!currentSub) {
        return ctx.badRequest('No active subscription found')
      }

      // Verify this is actually a downgrade
      const currentPlan = currentSub.plan as any
      if (!currentPlan || plan.sortOrder >= currentPlan.sortOrder) {
        return ctx.badRequest('This is not a downgrade. Please use the upgrade flow instead.')
      }

      // Schedule the downgrade on the current subscription (don't cancel it)
      await strapi.documents('api::subscription.subscription').update({
        documentId: currentSub.documentId,
        data: {
          scheduledDowngradePlan: plan.id,
          notes: `Scheduled downgrade from ${currentPlan.name} to ${plan.name}. Will take effect on ${currentSub.endDate}.`,
        } as any,
      })

      strapi.log.info(`User ${user.email} scheduled downgrade from ${currentPlan.name} to ${plan.name} (effective ${currentSub.endDate})`)

      return ctx.send({
        success: true,
        scheduledDowngradePlan: plan,
        effectiveDate: currentSub.endDate,
      })
    } catch (error) {
      strapi.log.error('Downgrade scheduling error:', error)
      return ctx.internalServerError('Failed to schedule downgrade')
    }
  },

  // ─── Cancel Scheduled Downgrade ─────────────────────────────────────────────
  async cancelScheduledDowngrade(ctx) {
    try {
      const user = ctx.state.user
      if (!user) {
        return ctx.unauthorized('You must be logged in')
      }

      // Get current active subscription with scheduled downgrade
      const currentSub = await strapi.documents('api::subscription.subscription').findFirst({
        filters: { user: { id: user.id }, status: 'active' },
        populate: ['plan', 'scheduledDowngradePlan'],
      })

      if (!currentSub) {
        return ctx.badRequest('No active subscription found')
      }

      if (!(currentSub as any).scheduledDowngradePlan) {
        return ctx.badRequest('No scheduled downgrade to cancel')
      }

      // Remove the scheduled downgrade
      await strapi.documents('api::subscription.subscription').update({
        documentId: currentSub.documentId,
        data: {
          scheduledDowngradePlan: null,
          notes: null,
        } as any,
      })

      strapi.log.info(`User ${user.email} cancelled scheduled downgrade`)

      return ctx.send({
        success: true,
      })
    } catch (error) {
      strapi.log.error('Cancel scheduled downgrade error:', error)
      return ctx.internalServerError('Failed to cancel scheduled downgrade')
    }
  },

  // Handle Stripe Webhook
  async handleWebhook(ctx) {
    const sig = ctx.request.headers['stripe-signature']
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event: Stripe.Event

    try {
      // For testing without webhook secret, parse the body directly
      if (!webhookSecret) {
        event = ctx.request.body as Stripe.Event
      } else {
        const rawBody = ctx.request.body
        event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret)
      }
    } catch (err: any) {
      strapi.log.error('Webhook signature verification failed:', err.message)
      return ctx.badRequest(`Webhook Error: ${err.message}`)
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const sessionType = session.metadata?.type // 'upgrade' or 'signup'
        
        if (sessionType === 'upgrade') {
          // Upgrade flow — check if already processed by checkoutSuccess
          const existingSubs = await strapi.documents('api::subscription.subscription').findMany({
            filters: { stripeSessionId: session.id, status: 'active' },
          })

          if (existingSubs.length > 0) {
            strapi.log.info(`Webhook: Session ${session.id} already processed, skipping`)
            break
          }

          const userDocumentId = session.metadata?.userDocumentId
          const planDocumentId = session.metadata?.planDocumentId
          const durationMonths = parseInt(session.metadata?.durationMonths || '1', 10)
          const amount = parseFloat(session.metadata?.amount || '0')
          const currency = session.metadata?.currency || 'THB'

          if (userDocumentId && planDocumentId) {
            const plan = await strapi.documents('api::plan.plan').findOne({ documentId: planDocumentId })
            const userDoc = await strapi.documents('plugin::users-permissions.user').findOne({ documentId: userDocumentId })

            if (plan && userDoc) {
              // Deactivate old subscriptions
              const currentSubs = await strapi.documents('api::subscription.subscription').findMany({
                filters: { user: { id: userDoc.id }, status: 'active' },
              })
              for (const sub of currentSubs) {
                await strapi.documents('api::subscription.subscription').update({
                  documentId: sub.documentId,
                  data: { status: 'cancelled' },
                })
              }

              const startDate = new Date()
              const endDate = new Date()
              endDate.setMonth(endDate.getMonth() + durationMonths)

              const subscription = await strapi.documents('api::subscription.subscription').create({
                data: {
                  user: userDoc.id,
                  plan: plan.id,
                  status: 'active',
                  startDate: startDate.toISOString().split('T')[0],
                  endDate: endDate.toISOString().split('T')[0],
                  amount,
                  currency,
                  paymentMethod: 'creditCard',
                  paymentStatus: 'paid',
                  paidAt: new Date().toISOString(),
                  stripeSessionId: session.id,
                  stripePaymentIntentId: session.payment_intent as string,
                  stripeCustomerId: session.customer as string,
                  transactionId: session.payment_intent as string,
                  invoiceNo: `INV-${Date.now()}`,
                },
              })

              await strapi.documents('plugin::users-permissions.user').update({
                documentId: userDocumentId,
                data: {
                  activeSubscription: subscription.documentId,
                  plan: plan.documentId,
                },
              })

              strapi.log.info(`Webhook: User ${userDoc.email} upgraded to ${plan.name}`)
            }
          }
        }
        // 'signup' type is handled by completeSignup endpoint, not webhook
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        strapi.log.warn('Payment failed:', paymentIntent.id)
        break
      }

      default:
        strapi.log.info(`Unhandled event type: ${event.type}`)
    }

    return ctx.send({ received: true })
  },

  // Create Stripe Checkout Session for new signup (before user creation)
  async createSignupCheckout(ctx) {
    try {
      const { planId, durationMonths = 1, fullName, email, password } = ctx.request.body

      if (!planId) {
        return ctx.badRequest('Plan ID is required')
      }

      if (!fullName || !email || !password) {
        return ctx.badRequest('Full name, email, and password are required')
      }

      // Check if email already exists
      const existingUser = await strapi.documents('plugin::users-permissions.user').findFirst({
        filters: { email },
      })

      if (existingUser) {
        return ctx.badRequest('Email already registered')
      }

      // Validate duration
      const validDurations = [1, 3, 6, 12]
      const duration = validDurations.includes(durationMonths) ? durationMonths : 1

      // Calculate discount based on duration
      const discountRates: Record<number, number> = {
        1: 0,    // No discount
        3: 10,   // 10% off
        6: 15,   // 15% off
        12: 20,  // 20% off
      }
      const discountPercent = discountRates[duration] || 0

      // Fetch the plan
      const plan = await strapi.documents('api::plan.plan').findOne({
        documentId: planId,
      })

      if (!plan) {
        return ctx.notFound('Plan not found')
      }

      if (!plan.isActive) {
        return ctx.badRequest('This plan is not available')
      }

      // Calculate total price with discount
      const baseTotal = plan.price * duration
      const discountAmount = baseTotal * (discountPercent / 100)
      const finalPrice = Math.round(baseTotal - discountAmount)

      // Duration labels for display
      const durationLabels: Record<number, string> = {
        1: '1 Month',
        3: '3 Months',
        6: '6 Months',
        12: '1 Year',
      }
      const durationLabel = durationLabels[duration] || `${duration} Months`

      // Create Stripe Checkout Session with signup data in metadata
      const session = await stripe.checkout.sessions.create({
        customer_email: email,
        payment_method_types: ['card', 'promptpay'],
        line_items: [
          {
            price_data: {
              currency: (plan.currency || 'THB').toLowerCase(),
              product_data: {
                name: `${plan.name} - ${durationLabel}`,
                description: `${plan.maxProperties} properties, ${plan.maxUnitsPerProperty} units per property${discountPercent > 0 ? ` (${discountPercent}% discount applied)` : ''}`,
              },
              unit_amount: Math.round(finalPrice * 100), // Stripe uses cents (satang for THB)
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?cancelled=true`,
        metadata: {
          type: 'signup',
          planId: String(plan.id),
          planDocumentId: plan.documentId,
          durationMonths: String(duration),
          fullName,
          email,
          // We don't store password in Stripe metadata for security, will use token
        },
      })

      // Create a temporary signup token to store password securely
      // Store in cache with session ID as key (expires in 1 hour)
      const crypto = require('crypto')
      const signupToken = crypto.randomBytes(32).toString('hex')
      
      // Store signup data in Strapi's cache/memory for later retrieval
      // Using global store for simplicity (in production, use Redis or similar)
      if (!(global as any).__signupTokens) {
        (global as any).__signupTokens = {}
      }
      (global as any).__signupTokens[session.id] = {
        password,
        signupToken,
        createdAt: Date.now(),
      }

      // Clean up old tokens (older than 1 hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      for (const key of Object.keys((global as any).__signupTokens)) {
        if ((global as any).__signupTokens[key].createdAt < oneHourAgo) {
          delete (global as any).__signupTokens[key]
        }
      }

      return ctx.send({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
      })
    } catch (error) {
      strapi.log.error('Signup checkout error:', error)
      return ctx.internalServerError('Failed to create checkout session')
    }
  },

  // Complete signup after successful payment
  async completeSignup(ctx) {
    try {
      const { session_id } = ctx.query
      const sessionId = session_id as string

      if (!sessionId) {
        return ctx.badRequest('Session ID is required')
      }

      // Retrieve the session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId)

      if (session.payment_status !== 'paid') {
        return ctx.badRequest('Payment not completed')
      }

      if (session.metadata?.type !== 'signup') {
        return ctx.badRequest('Invalid session type')
      }

      const { fullName, email, planDocumentId, durationMonths } = session.metadata

      // Check if user already created from this session (handles page refresh / server restart)
      const existingUser = await strapi.documents('plugin::users-permissions.user').findFirst({
        filters: { email },
        populate: {
          role: true,
          activeSubscription: {
            populate: { plan: true },
          },
        },
      })

      if (existingUser) {
        // Clean up token if it exists
        if ((global as any).__signupTokens?.[sessionId]) {
          delete (global as any).__signupTokens[sessionId]
        }
        
        // User already exists (page refresh) — still issue JWT so they can log in
        const jwt = strapi.plugin('users-permissions').service('jwt').issue({
          id: existingUser.id,
        })

        return ctx.send({
          success: true,
          alreadyCreated: true,
          jwt,
          user: {
            id: existingUser.id,
            documentId: existingUser.documentId,
            email: existingUser.email,
            username: existingUser.username,
            role: existingUser.role,
            activeSubscription: existingUser.activeSubscription,
          },
        })
      }

      // Get stored password (only needed for new user creation)
      const storedData = (global as any).__signupTokens?.[sessionId]
      if (!storedData) {
        return ctx.badRequest('Signup session expired. Please try again.')
      }

      const { password } = storedData

      // Get the manager role
      const managerRole = await strapi.documents('plugin::users-permissions.role').findFirst({
        filters: { type: 'manager' },
      })

      if (!managerRole) {
        return ctx.internalServerError('Manager role not found')
      }

      // Create the user (username must be unique slug for Strapi auth)
      const safeUsername = fullName.replace(/\s+/g, '').toLowerCase()
      const user = await strapi.documents('plugin::users-permissions.user').create({
        data: {
          username: safeUsername,
          email,
          password,
          provider: 'local',
          confirmed: true,
          role: managerRole.id,
        },
      })

      // Get the plan
      const plan = await strapi.documents('api::plan.plan').findOne({
        documentId: planDocumentId,
      })

      // Calculate dates
      const duration = parseInt(durationMonths || '1', 10)
      const startDate = new Date()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + duration)

      // Calculate final amount
      const discountRates: Record<number, number> = { 1: 0, 3: 10, 6: 15, 12: 20 }
      const discountPercent = discountRates[duration] || 0
      const baseTotal = (plan?.price || 0) * duration
      const finalPrice = Math.round(baseTotal - (baseTotal * discountPercent / 100))

      // Create subscription
      const subscription = await strapi.documents('api::subscription.subscription').create({
        data: {
          user: user.id,
          plan: plan?.id,
          status: 'active',
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          amount: finalPrice,
          currency: plan?.currency || 'THB',
          paymentMethod: 'creditCard',
          paymentStatus: 'paid',
          paidAt: new Date().toISOString(),
          invoiceNo: `INV-${Date.now()}`,
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          stripeCustomerId: session.customer as string,
          transactionId: session.payment_intent as string,
        },
      })

      // Update user's active subscription
      await strapi.documents('plugin::users-permissions.user').update({
        documentId: user.documentId,
        data: {
          activeSubscription: subscription.documentId,
        },
      })

      // Clean up token
      delete (global as any).__signupTokens[sessionId]

      // Generate JWT token for auto-login
      const jwt = strapi.plugin('users-permissions').service('jwt').issue({
        id: user.id,
      })

      // Fetch user with populated fields for response
      const userWithSubscription = await strapi.documents('plugin::users-permissions.user').findOne({
        documentId: user.documentId,
        populate: {
          role: true,
          activeSubscription: {
            populate: {
              plan: true,
            },
          },
        },
      })

      return ctx.send({
        success: true,
        jwt,
        user: {
          id: userWithSubscription.id,
          documentId: userWithSubscription.documentId,
          email: userWithSubscription.email,
          username: userWithSubscription.username,
          role: userWithSubscription.role,
          activeSubscription: userWithSubscription.activeSubscription,
        },
      })
    } catch (error) {
      strapi.log.error('Complete signup error:', error)
      return ctx.internalServerError('Failed to complete signup')
    }
  },

  // Verify checkout success and activate subscription
  async checkoutSuccess(ctx) {
    try {
      const user = ctx.state.user
      if (!user) {
        return ctx.unauthorized('You must be logged in')
      }

      const { session_id } = ctx.query

      if (!session_id) {
        return ctx.badRequest('Session ID is required')
      }

      // Retrieve the session from Stripe
      const session = await stripe.checkout.sessions.retrieve(session_id as string)

      if (session.payment_status !== 'paid') {
        return ctx.badRequest('Payment not completed')
      }

      // Check if we already processed this session (idempotency)
      const existingSubs = await strapi.documents('api::subscription.subscription').findMany({
        filters: { stripeSessionId: session.id, status: 'active' },
        populate: ['plan'],
      })

      if (existingSubs.length > 0) {
        // Already processed — return the existing subscription
        return ctx.send({
          success: true,
          subscription: existingSubs[0],
        })
      }

      // Get plan and duration info from session metadata
      const planDocumentId = session.metadata?.planDocumentId
      const durationMonths = parseInt(session.metadata?.durationMonths || '1', 10)
      const amount = parseFloat(session.metadata?.amount || '0')
      const currency = session.metadata?.currency || 'THB'
      const stripeCustomerId = session.metadata?.stripeCustomerId || (session.customer as string)

      if (!planDocumentId) {
        return ctx.badRequest('Plan info not found in session')
      }

      // Fetch the plan
      const plan = await strapi.documents('api::plan.plan').findOne({
        documentId: planDocumentId,
      })

      if (!plan) {
        return ctx.badRequest('Plan not found')
      }

      // Deactivate current active subscription(s)
      const currentSubs = await strapi.documents('api::subscription.subscription').findMany({
        filters: { user: { id: user.id }, status: 'active' },
      })
      for (const sub of currentSubs) {
        await strapi.documents('api::subscription.subscription').update({
          documentId: sub.documentId,
          data: { status: 'cancelled' },
        })
      }

      // Calculate dates
      const startDate = new Date()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + durationMonths)

      // Duration labels
      const durationLabels: Record<number, string> = { 1: '1 Month', 3: '3 Months', 6: '6 Months', 12: '1 Year' }
      const durationLabel = durationLabels[durationMonths] || `${durationMonths} Months`
      const discountRates: Record<number, number> = { 1: 0, 3: 10, 6: 15, 12: 20 }
      const discountPercent = discountRates[durationMonths] || 0

      // Create the subscription now that payment is confirmed
      const subscription = await strapi.documents('api::subscription.subscription').create({
        data: {
          user: user.id,
          plan: plan.id,
          status: 'active',
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          amount,
          currency,
          paymentMethod: 'creditCard',
          paymentStatus: 'paid',
          paidAt: new Date().toISOString(),
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          stripeCustomerId,
          transactionId: session.payment_intent as string,
          invoiceNo: `INV-${Date.now()}`,
          notes: `Duration: ${durationLabel}${discountPercent > 0 ? `, Discount: ${discountPercent}%` : ''}`,
        },
      })

      // Update user's active subscription and plan
      await strapi.documents('plugin::users-permissions.user').update({
        documentId: user.documentId,
        data: {
          activeSubscription: subscription.documentId,
          plan: plan.documentId,
        },
      })

      strapi.log.info(`User ${user.email} upgraded to plan ${plan.name} (${durationLabel})`)

      return ctx.send({
        success: true,
        subscription: {
          ...subscription,
          plan,
        },
      })
    } catch (error) {
      strapi.log.error('Checkout success error:', error)
      return ctx.internalServerError('Failed to verify payment')
    }
  },
}))
