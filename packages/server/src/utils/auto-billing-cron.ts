/**
 * Auto-billing cron job
 * Runs daily to automatically generate bills for residents whose nextBillDate <= today
 * and whose meter readings for the billing month are available.
 *
 * For residents with missing/outdated meters, it sends a notification to the property manager.
 */

import type { Core } from '@strapi/strapi'

export async function runAutoBilling({ strapi }: { strapi: Core.Strapi }) {
  const today = new Date().toISOString().split('T')[0]
  strapi.log.info(`[AutoBilling] Cron started — checking for bills due on or before ${today}`)

  const knex = strapi.db.connection

  try {
    // ── 1. Find all residents whose nextBillDate <= today ──────────────────────
    const residents: any[] = await knex('up_users as u')
      .join('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .where('rl.role_id', 4) // resident role
      .whereNotNull('u.next_bill_date')
      .where('u.next_bill_date', '<=', today)
      .where(function () {
        this.where('u.residency_status', 'active').orWhere('u.residency_status', 'reserved')
      })
      .leftJoin('up_users_property_lnk as pl', 'pl.user_id', 'u.id')
      .leftJoin('properties as p', 'p.id', 'pl.property_id')
      .leftJoin('up_users_unit_type_lnk as utl', 'utl.user_id', 'u.id')
      .leftJoin('unit_types as ut', 'ut.id', 'utl.unit_type_id')
      .select(
        'u.id',
        'u.document_id as documentId',
        'u.username',
        'u.next_bill_date as nextBillDate',
        'u.room_number as roomNumber',
        'p.id as propertyId',
        'p.document_id as propertyDocumentId',
        'p.name as propertyName',
        'p.electric_price_per_unit as electricPricePerUnit',
        'p.water_price_per_unit as waterPricePerUnit',
        'p.common_area_fee as commonAreaFee',
        'p.invoice_due_days as invoiceDueDays',
        'p.currency as propertyCurrency',
        'ut.id as unitTypeId',
        'ut.price as unitTypePrice',
        'ut.currency as unitTypeCurrency',
      )

    if (!residents.length) {
      strapi.log.info('[AutoBilling] No pending bills found. Done.')
      return
    }

    strapi.log.info(`[AutoBilling] Found ${residents.length} resident(s) with pending bills`)

    let generated = 0
    let skipped = 0
    const errors: string[] = []

    // Group residents with missing/outdated meters by property → manager
    const meterWarnings: Map<
      string,
      { propertyName: string; managerId: string; residents: string[] }
    > = new Map()

    for (const r of residents) {
      try {
        const billDate = r.nextBillDate
        if (!billDate) continue

        const billYear = parseInt(billDate.substring(0, 4), 10)
        const billMonth = parseInt(billDate.substring(5, 7), 10)

        // Find room
        const room = await knex('rooms as rm')
          .leftJoin('rooms_resident_lnk as rrl', 'rrl.room_id', 'rm.id')
          .where('rrl.user_id', r.id)
          .select(
            'rm.id as roomId',
            'rm.document_id as roomDocumentId',
            'rm.electric_meter as electricMeter',
            'rm.water_meter as waterMeter',
          )
          .first()

        // Check meter reading for the billing month
        let meterReading: any = null
        if (room) {
          const monthStart = `${billYear}-${String(billMonth).padStart(2, '0')}-01`
          const nextMonth =
            billMonth === 12
              ? `${billYear + 1}-01-01`
              : `${billYear}-${String(billMonth + 1).padStart(2, '0')}-01`

          meterReading = await knex('meter_readings as mr')
            .leftJoin('meter_readings_room_lnk as mrl', 'mrl.meter_reading_id', 'mr.id')
            .where('mrl.room_id', room.roomId)
            .where('mr.reading_date', '>=', monthStart)
            .where('mr.reading_date', '<', nextMonth)
            .orderBy('mr.reading_date', 'desc')
            .select(
              'mr.electric_meter_value as electricMeterValue',
              'mr.water_meter_value as waterMeterValue',
              'mr.electric_meter_prev as electricMeterPrev',
              'mr.water_meter_prev as waterMeterPrev',
            )
            .first()
        }

        // If no meter reading for billing month → skip and collect warning
        if (!meterReading) {
          skipped++

          // Find property manager to notify
          if (r.propertyDocumentId) {
            const key = r.propertyDocumentId
            if (!meterWarnings.has(key)) {
              // Find property owner (manager) via up_users_property_lnk
              const owner = await knex('up_users_property_lnk as upl')
                .join('up_users as ou', 'ou.id', 'upl.user_id')
                .join('up_users_role_lnk as orl', 'orl.user_id', 'ou.id')
                .leftJoin('properties as pp', 'pp.id', 'upl.property_id')
                .where('pp.document_id', r.propertyDocumentId)
                .where('orl.role_id', 3) // Manager role
                .select('ou.document_id as managerDocumentId')
                .first()

              meterWarnings.set(key, {
                propertyName: r.propertyName || 'Unknown',
                managerId: owner?.managerDocumentId || '',
                residents: [],
              })
            }
            meterWarnings.get(key)!.residents.push(
              `${r.username} (Room ${r.roomNumber || '?'})`,
            )
          }
          continue
        }

        // ── Generate the bill ─────────────────────────────────────────────
        const electricMeterStart = meterReading.electricMeterPrev || 0
        const electricMeterEnd = meterReading.electricMeterValue || 0
        const waterMeterStart = meterReading.waterMeterPrev || 0
        const waterMeterEnd = meterReading.waterMeterValue || 0

        const electricPricePerUnit = r.electricPricePerUnit || 0
        const waterPricePerUnit = r.waterPricePerUnit || 0
        const electricUnitsUsed = Math.max(0, electricMeterEnd - electricMeterStart)
        const waterUnitsUsed = Math.max(0, waterMeterEnd - waterMeterStart)
        const electricAmount = electricUnitsUsed * electricPricePerUnit
        const waterAmount = waterUnitsUsed * waterPricePerUnit
        const unitTypePrice = r.unitTypePrice || 0
        const commonAreaFee = r.commonAreaFee || 0
        const totalAmount = unitTypePrice + electricAmount + waterAmount + commonAreaFee

        // Due date
        const dueDays = r.invoiceDueDays || 30
        const dueDate = new Date(billDate)
        dueDate.setDate(dueDate.getDate() + dueDays)
        const dueDateStr = dueDate.toISOString().split('T')[0]

        // Invoice number
        const now = new Date()
        const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
        const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
        const invoiceNo = `${prefix}-${rand}`

        // Description
        const monthNames = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        ]
        const description = `Monthly rent & utilities — ${monthNames[billMonth - 1]} ${billYear}`

        // Create billing
        const billing = await strapi.documents('api::billing.billing').create({
          data: {
            invoiceNo,
            type: 'monthlyRent',
            description,
            amount: totalAmount,
            currency: r.propertyCurrency || 'THB',
            dueDate: dueDateStr,
            status: 'pending',
            unitTypePrice,
            electricMeterStart,
            electricMeterEnd,
            electricUnitPrice: electricPricePerUnit,
            electricUnitsUsed,
            electricAmount,
            waterMeterStart,
            waterMeterEnd,
            waterUnitPrice: waterPricePerUnit,
            waterUnitsUsed,
            waterAmount,
            commonAreaFee,
            resident: r.id,
            property: r.propertyDocumentId,
          } as any,
        })

        // Advance nextBillDate by 1 month
        const nextBill = new Date(billYear, billMonth, parseInt(billDate.substring(8, 10), 10))
        await knex('up_users').where('id', r.id).update({
          next_bill_date: nextBill.toISOString().split('T')[0],
        })

        // Notify resident
        try {
          const formattedDue = dueDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          await strapi.service('api::notification.notification').createAndNotify({
            title: `New invoice ${invoiceNo}`,
            message: `Due on ${formattedDue}`,
            type: 'billing',
            priority: 'high',
            relatedDocumentId: billing.documentId,
            actionUrl: '/resident/my-bills',
            metadata: {
              invoiceNo,
              amount: totalAmount,
              currency: r.propertyCurrency || 'THB',
              dueDate: dueDateStr,
              status: 'pending',
              propertyName: r.propertyName,
            },
            recipientId: r.documentId,
            propertyId: r.propertyDocumentId,
          })
        } catch (notifErr) {
          strapi.log.error(`[AutoBilling] Notification error for resident ${r.id}:`, notifErr)
        }

        generated++
        strapi.log.info(
          `[AutoBilling] Generated ${invoiceNo} for ${r.username} — ฿${totalAmount}`,
        )
      } catch (err: any) {
        errors.push(`Resident ${r.id} (${r.username}): ${err.message}`)
        strapi.log.error(`[AutoBilling] Error for resident ${r.id}:`, err)
      }
    }

    // ── 2. Notify managers about residents with missing/outdated meters ────
    for (const [propertyDocId, info] of meterWarnings) {
      if (!info.managerId) continue
      try {
        const residentsText = info.residents.join(', ')
        await strapi.service('api::notification.notification').createAndNotify({
          title: `⚡ Meter readings needed — ${info.propertyName}`,
          message: `${info.residents.length} resident(s) have bills due but missing meter readings: ${residentsText}. Please update meters to generate their invoices.`,
          type: 'billing',
          priority: 'high',
          actionUrl: `/manager/properties/${propertyDocId}/meters`,
          metadata: {
            type: 'auto-bill-meter-warning',
            propertyName: info.propertyName,
            residentCount: info.residents.length,
            residents: info.residents,
          },
          recipientId: info.managerId,
          propertyId: propertyDocId,
        })
        strapi.log.info(
          `[AutoBilling] Sent meter warning to manager for ${info.propertyName} (${info.residents.length} residents)`,
        )
      } catch (err) {
        strapi.log.error(`[AutoBilling] Failed to notify manager for ${propertyDocId}:`, err)
      }
    }

    // ── 3. Summary log ────────────────────────────────────────────────────
    strapi.log.info(
      `[AutoBilling] Cron complete — Generated: ${generated}, Skipped (no meter): ${skipped}, Errors: ${errors.length}`,
    )
    if (errors.length) {
      strapi.log.warn(`[AutoBilling] Errors:\n  ${errors.join('\n  ')}`)
    }
  } catch (err) {
    strapi.log.error('[AutoBilling] Cron fatal error:', err)
  }
}
