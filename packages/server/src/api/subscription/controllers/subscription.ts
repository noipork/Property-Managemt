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

        // Update user's active subscription
        await strapi.documents('plugin::users-permissions.user').update({
          documentId: user.documentId,
          data: {
            activeSubscription: subscription.id,
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
      const finalPrice = Math.round(baseTotal - discountAmount)

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

        // Save customer ID to user (optional - would need to add field to user schema)
      }

      // Duration labels for display
      const durationLabels: Record<number, string> = {
        1: '1 Month',
        3: '3 Months',
        6: '6 Months',
        12: '1 Year',
      }
      const durationLabel = durationLabels[duration] || `${duration} Months`

      // Create pending subscription first
      const pendingSubscription = await strapi.documents('api::subscription.subscription').create({
        data: {
          user: user.id,
          plan: plan.id,
          status: 'pending',
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          amount: finalPrice,
          currency: plan.currency || 'THB',
          paymentMethod: 'creditCard',
          paymentStatus: 'pending',
          stripeCustomerId,
          invoiceNo: `INV-${Date.now()}`,
          notes: `Duration: ${durationLabel}${discountPercent > 0 ? `, Discount: ${discountPercent}%` : ''}`,
        },
      })

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
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
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/manager/packages?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/manager/packages?cancelled=true`,
        metadata: {
          subscriptionId: String(pendingSubscription.id),
          subscriptionDocumentId: pendingSubscription.documentId,
          planId: String(plan.id),
          planDocumentId: plan.documentId,
          userId: String(user.id),
          userDocumentId: user.documentId,
        },
      })

      // Update subscription with session ID
      await strapi.documents('api::subscription.subscription').update({
        documentId: pendingSubscription.documentId,
        data: {
          stripeSessionId: session.id,
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
        
        const subscriptionDocumentId = session.metadata?.subscriptionDocumentId
        
        if (subscriptionDocumentId) {
          // Update subscription to active
          await strapi.documents('api::subscription.subscription').update({
            documentId: subscriptionDocumentId,
            data: {
              status: 'active',
              paymentStatus: 'paid',
              paidAt: new Date().toISOString(),
              stripePaymentIntentId: session.payment_intent as string,
              transactionId: session.payment_intent as string,
            },
          })

          // Update user's active subscription
          const userDocumentId = session.metadata?.userDocumentId
          if (userDocumentId) {
            const subscription = await strapi.documents('api::subscription.subscription').findOne({
              documentId: subscriptionDocumentId,
            })
            
            await strapi.documents('plugin::users-permissions.user').update({
              documentId: userDocumentId,
              data: {
                activeSubscription: subscription?.id,
              },
            })
          }

          strapi.log.info(`Subscription ${subscriptionDocumentId} activated via Stripe webhook`)
        }
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

      // Get stored password
      const storedData = (global as any).__signupTokens?.[sessionId]
      if (!storedData) {
        return ctx.badRequest('Signup session expired. Please try again.')
      }

      const { password } = storedData

      // Check if user already created from this session
      const existingUser = await strapi.documents('plugin::users-permissions.user').findFirst({
        filters: { email },
      })

      if (existingUser) {
        // Clean up token
        delete (global as any).__signupTokens[sessionId]
        
        // User already exists, might be a refresh - just return success
        return ctx.send({
          success: true,
          alreadyCreated: true,
          message: 'Account already created',
        })
      }

      // Get the manager role
      const managerRole = await strapi.documents('plugin::users-permissions.role').findFirst({
        filters: { type: 'manager' },
      })

      if (!managerRole) {
        return ctx.internalServerError('Manager role not found')
      }

      // Create the user
      const user = await strapi.documents('plugin::users-permissions.user').create({
        data: {
          username: fullName, // Use fullName as username for display
          email,
          password,
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
          activeSubscription: subscription.id,
        },
      })

      // Clean up token
      delete (global as any).__signupTokens[sessionId]

      // Generate JWT token for auto-login
      const jwt = strapi.plugin('users-permissions').service('jwt').issue({
        id: user.id,
      })

      return ctx.send({
        success: true,
        jwt,
        user: {
          id: user.id,
          documentId: user.documentId,
          email: user.email,
          username: user.username,
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

      const subscriptionDocumentId = session.metadata?.subscriptionDocumentId

      if (!subscriptionDocumentId) {
        return ctx.badRequest('Subscription not found')
      }

      // Check if subscription belongs to user
      const subscription = await strapi.documents('api::subscription.subscription').findOne({
        documentId: subscriptionDocumentId,
        populate: ['user', 'plan'],
      })

      if (!subscription) {
        return ctx.notFound('Subscription not found')
      }

      // Update subscription if not already active
      if (subscription.status !== 'active') {
        await strapi.documents('api::subscription.subscription').update({
          documentId: subscriptionDocumentId,
          data: {
            status: 'active',
            paymentStatus: 'paid',
            paidAt: new Date().toISOString(),
            stripePaymentIntentId: session.payment_intent as string,
            transactionId: session.payment_intent as string,
          },
        })

        // Update user's active subscription
        await strapi.documents('plugin::users-permissions.user').update({
          documentId: user.documentId,
          data: {
            activeSubscription: subscription.id,
          },
        })
      }

      return ctx.send({
        success: true,
        subscription: {
          ...subscription,
          status: 'active',
          paymentStatus: 'paid',
        },
      })
    } catch (error) {
      strapi.log.error('Checkout success error:', error)
      return ctx.internalServerError('Failed to verify payment')
    }
  },
}))
