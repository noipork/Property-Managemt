<script setup lang="ts">
import { onMounted, nextTick } from 'vue'
import gsap from 'gsap'

definePageMeta({
    layout: 'auth',
})

const { t, lang } = useI18n()

const lastUpdated = '9 มีนาคม 2026'
const lastUpdatedEN = 'March 9, 2026'

onMounted(() => {
    nextTick(() => {
        // Animate header
        gsap.fromTo(
            '.terms-header',
            { y: -20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.6,
                ease: 'power3.out',
                clearProps: 'all',
            }
        )

        // Animate title
        gsap.fromTo(
            '.terms-title',
            { y: 30, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.7,
                delay: 0.2,
                ease: 'power3.out',
                clearProps: 'all',
            }
        )

        // Animate sections with stagger
        gsap.fromTo(
            '.terms-section',
            { y: 20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.6,
                stagger: 0.1,
                delay: 0.4,
                ease: 'power2.out',
                clearProps: 'all',
            }
        )

        // Animate back link
        gsap.fromTo(
            '.terms-back',
            { y: 10, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.5,
                delay: 0.6,
                ease: 'power2.out',
                clearProps: 'all',
            }
        )
    })
})
</script>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <!-- Header -->
        <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 terms-header">
            <div class="max-w-4xl mx-auto px-6 py-4">
                <div class="flex items-center justify-between">
                    <NuxtLink to="/" class="flex items-center gap-3">
                        <img src="/logo.png" alt="PropManager" class="w-10 h-10 rounded-xl object-contain" />
                        <span class="text-xl font-bold text-gray-800 dark:text-white">PropManager</span>
                    </NuxtLink>
                    <NuxtLink to="/signup"
                        class="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {{ lang === 'TH' ? 'กลับไปสมัครสมาชิก' : 'Back to Sign Up' }}
                    </NuxtLink>
                </div>
            </div>
        </header>

        <!-- Content -->
        <main class="max-w-4xl mx-auto px-6 py-12">
            <div
                class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 md:p-12">
                <!-- Title -->
                <div class="text-center mb-10 terms-title">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {{ lang === 'TH' ? 'ข้อกำหนดการใช้งาน' : 'Terms of Service' }}
                    </h1>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">
                        {{ lang === 'TH' ? 'อัปเดตล่าสุด:' : 'Last updated:' }} {{ lang === 'TH' ? lastUpdated :
                            lastUpdatedEN }}
                    </p>
                </div>

                <!-- Content -->
                <div class="prose prose-gray dark:prose-invert max-w-none">
                    <!-- Introduction -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '1. บทนำ' : '1. Introduction' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `ยินดีต้อนรับสู่ PropManager ระบบจัดการอสังหาริมทรัพย์แบบครบวงจรสำหรับผู้จัดการโครงการ
                            (Manager) และผู้อยู่อาศัย(Resident) ครอบคลุมงานสำคัญตั้งแต่การจัดการทรัพย์สิน สัญญาเช่า
                            บิล / การชำระเงิน งานซ่อมบำรุง แชตแบบเรียลไทม์ ประกาศข่าวสาร ไปจนถึงการแจ้งเตือนแบบ Push
                            Notification`
                                : `Welcome to PropManager, a comprehensive property management system for Project Managers
                            and Residents.It covers essential tasks from property management, lease agreements,
                            billing/payments, maintenance, real-time chat, announcements, to Push Notifications.` }}
                        </p>
                    </section>

                    <!-- Acceptance -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '2. การยอมรับข้อกำหนด' : '2. Acceptance of Terms' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `การใช้งาน PropManager ถือว่าท่านยอมรับข้อกำหนดการใช้งานนี้ทั้งหมด
                            หากท่านไม่ยอมรับข้อกำหนดใดๆ กรุณาหยุดการใช้งานระบบทันที`
                                : `By using PropManager, you agree to these Terms of Service in their entirety. If you do
                            not agree to any terms, please stop using the system immediately.` }}
                        </p>
                    </section>

                    <!-- User Roles -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '3. บทบาทผู้ใช้งาน' : '3. User Roles' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                            {{ lang === 'TH' ? 'ระบบแบ่งผู้ใช้ออกเป็น 2 บทบาทหลัก:'
                                : 'The system divides users into 2 main roles:' }}
                        </p>

                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-4">
                            <h3 class="font-semibold text-gray-900 dark:text-white mb-3">
                                {{ lang === 'TH' ? 'ผู้จัดการ (Manager)' : 'Manager' }}
                            </h3>
                            <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2 text-sm">
                                <li>{{ lang === 'TH' ? `ดูแลโครงการ ห้องเช่า ผู้เช่า สัญญา บิล และคำร้องต่างๆ
                                    ได้ในระบบเดียว` : `Manage projects, rental units, tenants, contracts, bills, and
                                    requests in one system` }}</li>
                                <li>{{ lang === 'TH' ? `ออกบิลพร้อมค่าน้ำ-ค่าไฟจากมิเตอร์เริ่ม/สิ้นสุด` : `Issue bills
                                    with water - electricity from start/end meter readings` }}</li>
                                <li>{{ lang === 'TH' ? `ตรวจสอบการชำระเงินและหลักฐานการโอน` : `Verify payments and
                                    transfer evidence` }}</li>
                                <li>{{ lang === 'TH' ? `จัดการงานซ่อมบำรุงพร้อมลำดับความสำคัญและสถานะ` : `Manage
                                    maintenance with priority and status` }}</li>
                                <li>{{ lang === 'TH' ? `สื่อสารผ่านแชตแบบเรียลไทม์และสร้างประกาศข่าวสาร` : `Communicate
                                    via real - time chat and create announcements` }}</li>
                            </ul>
                        </div>

                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                            <h3 class="font-semibold text-gray-900 dark:text-white mb-3">
                                {{ lang === 'TH' ? 'ผู้อยู่อาศัย (Resident)' : 'Resident' }}
                            </h3>
                            <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2 text-sm">
                                <li>{{ lang === 'TH' ? `ดูสัญญา บิล ประวัติชำระเงิน` : `View contracts, bills, payment
                                    history` }}</li>
                                <li>{{ lang === 'TH' ? `แจ้งซ่อม ติดตามสถานะ และคุยกับผู้ดูแลแบบเรียลไทม์` : `Report
                                    repairs, track status, and chat with management in real-time` }}</li>
                                <li>{{ lang === 'TH' ? `ใช้งานระบบแชตกับผู้จัดการ` : `Use chat system with manager` }}
                                </li>
                                <li>{{ lang === 'TH' ? `ดูสินทรัพย์ที่ใช้งานได้และส่งคำขออนุมัติ` : `View available
                                    assets and submit approval requests` }}</li>
                            </ul>
                        </div>
                    </section>

                    <!-- Subscription Plans -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '4. แพ็กเกจและข้อจำกัดการใช้งาน' : '4. Subscription Plans & Limitations'
                            }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `ระบบมีแพ็กเกจ (Plan) สำหรับกำหนดเพดานการใช้งาน เช่น
                            จำนวนทรัพย์สินสูงสุด / จำนวนยูนิตต่อทรัพย์สิน ระบบจะตรวจสอบข้อจำกัดก่อนสร้างข้อมูลสำคัญ
                            ผู้ใช้สามารถอัปเกรดแพ็กเกจเพื่อเพิ่มความสามารถในการใช้งานได้`
                                : `The system has Plans to set usage limits such as maximum properties/units per property.
                            The system will check limitations before creating important data. Users can upgrade plans to
                            increase capabilities.` }}
                        </p>
                    </section>

                    <!-- Payment -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '5. การชำระเงิน' : '5. Payment' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `การชำระเงินค่าแพ็กเกจจะดำเนินการผ่านระบบ Stripe
                            ซึ่งเป็นผู้ให้บริการชำระเงินออนไลน์ที่ได้รับมาตรฐานความปลอดภัยระดับสากล
                            รองรับการชำระผ่านบัตรเครดิต / เดบิต และ PromptPay`
                                : `Package payments are processed through Stripe, an internationally certified secure online
                            payment provider. Supports credit/debit cards and PromptPay.` }}
                        </p>
                    </section>

                    <!-- User Responsibilities -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '6. ความรับผิดชอบของผู้ใช้' : '6. User Responsibilities' }}
                        </h2>
                        <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                            <li>{{ lang === 'TH' ? `รักษาความลับของข้อมูลบัญชีและรหัสผ่าน` : `Keep account information
                                and passwords confidential` }}</li>
                            <li>{{ lang === 'TH' ? `ใช้งานระบบอย่างถูกต้องตามกฎหมาย` : `Use the system legally and
                                appropriately` }}</li>
                            <li>{{ lang === 'TH' ? `ไม่แชร์ข้อมูลการเข้าถึงกับบุคคลที่ไม่ได้รับอนุญาต` : `Do not share
                                access with unauthorized persons` }}</li>
                            <li>{{ lang === 'TH' ? `รายงานปัญหาหรือช่องโหว่ด้านความปลอดภัยที่พบ` : `Report any security
                                issues or vulnerabilities found` }}</li>
                        </ul>
                    </section>

                    <!-- Prohibited Activities -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? `7. กิจกรรมที่ห้าม` : `7. Prohibited Activities` }}
                        </h2>
                        <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                            <li>{{ lang === 'TH' ? `พยายามเข้าถึงข้อมูลของผู้ใช้อื่นโดยไม่ได้รับอนุญาต` : `Attempting to
                                access other users\' data without permission` }}</li>
                            <li>{{ lang === 'TH' ? `ใช้ระบบเพื่อกิจกรรมที่ผิดกฎหมาย` : `Using the system for illegal
                                activities` }}</li>
                            <li>{{ lang === 'TH' ? `ส่งข้อมูลที่เป็นอันตรายหรือไวรัสเข้าสู่ระบบ` : `Sending harmful data
                                or viruses to the system` }}</li>
                            <li>{{ lang === 'TH' ? `ละเมิดทรัพย์สินทางปัญญาของ PropManager` : `Violating PropManager\'s
                                intellectual property` }}</li>
                        </ul>
                    </section>

                    <!-- Service Availability -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? `8. ความพร้อมใช้งานของบริการ` : `8. Service Availability` }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `เรามุ่งมั่นให้บริการอย่างต่อเนื่อง
                            แต่อาจมีช่วงเวลาที่ระบบไม่พร้อมใช้งานเนื่องจากการบำรุงรักษาหรือเหตุสุดวิสัย
                            เราจะแจ้งให้ทราบล่วงหน้าเมื่อมีการบำรุงรักษาตามกำหนด`
                                : `We strive to provide continuous service, but there may be periods of unavailability due
                            to maintenance or force majeure. We will notify in advance of scheduled maintenance.` }}
                        </p>
                    </section>

                    <!-- Changes to Terms -->
                    <section class="mb-8 terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? `9. การเปลี่ยนแปลงข้อกำหนด` : `9. Changes to Terms` }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `เราขอสงวนสิทธิ์ในการแก้ไขข้อกำหนดการใช้งานนี้ได้ตลอดเวลา
                            การเปลี่ยนแปลงจะมีผลบังคับใช้ทันทีที่ประกาศบนเว็บไซต์
                            การใช้งานต่อหลังจากการเปลี่ยนแปลงถือว่าท่านยอมรับข้อกำหนดใหม่`
                                : `We reserve the right to modify these Terms of Service at any time. Changes will take
                            effect immediately upon posting on the website. Continued use after changes constitutes
                            acceptance of new terms.` }}
                        </p>
                    </section>

                    <!-- Contact -->
                    <section class="terms-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? `10. ติดต่อเรา` : `10. Contact Us` }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `หากมีคำถามเกี่ยวกับข้อกำหนดการใช้งาน กรุณาติดต่อเราผ่านระบบแชทในแอปพลิเคชัน หรืออีเมล
                            support @propmanager.com`
                                : `If you have questions about these Terms of Service, please contact us through the in-app
                            chat system or email support@propmanager.com` }}
                        </p>
                    </section>
                </div>

                <!-- Back link -->
                <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 text-center terms-back">
                    <NuxtLink to="/signup"
                        class="inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        <i class="ti-arrow-left text-sm"></i>
                        {{ lang === 'TH' ? 'กลับไปสมัครสมาชิก' : 'Back to Sign Up' }}
                    </NuxtLink>
                </div>
            </div>
        </main>
    </div>
</template>
