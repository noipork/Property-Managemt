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
            '.privacy-header',
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
            '.privacy-title',
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
            '.privacy-section',
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
            '.privacy-back',
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
        <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 privacy-header">
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
                <div class="text-center mb-10 privacy-title">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {{ lang === 'TH' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy' }}
                    </h1>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">
                        {{ lang === 'TH' ? 'อัปเดตล่าสุด:' : 'Last updated:' }} {{ lang === 'TH' ? lastUpdated :
                            lastUpdatedEN }}
                    </p>
                </div>

                <!-- Content -->
                <div class="prose prose-gray dark:prose-invert max-w-none">
                    <!-- Introduction -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '1. บทนำ' : '1. Introduction' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `PropManager ให้ความสำคัญกับความเป็นส่วนตัวของผู้ใช้งาน นโยบายนี้อธิบายวิธีการเก็บรวบรวม
                            ใช้งาน และปกป้องข้อมูลส่วนบุคคลของท่านเมื่อใช้งานระบบจัดการอสังหาริมทรัพย์ของเรา`
                                : `PropManager values user privacy. This policy explains how we collect, use, and protect
                            your personal information when using our property management system.` }}
                        </p>
                    </section>

                    <!-- Data Collection -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '2. ข้อมูลที่เราเก็บรวบรวม' : '2. Information We Collect' }}
                        </h2>

                        <div class="space-y-4">
                            <div
                                class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
                                <h3 class="font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
                                    <i class="ti-user text-blue-600 dark:text-blue-400"></i>
                                    {{ lang === 'TH' ? 'ข้อมูลบัญชีผู้ใช้' : 'Account Information' }}
                                </h3>
                                <ul class="list-disc list-inside text-blue-800 dark:text-blue-300 space-y-1 text-sm">
                                    <li>{{ lang === 'TH' ? 'ชื่อ-นามสกุล' : 'Full name' }}</li>
                                    <li>{{ lang === 'TH' ? 'อีเมล' : 'Email address' }}</li>
                                    <li>{{ lang === 'TH' ? 'รหัสผ่าน (เข้ารหัสแล้ว)' : 'Password (encrypted)' }}</li>
                                    <li>{{ lang === 'TH' ? 'บทบาทผู้ใช้ (Manager/Resident)'
                                        : 'User role (Manager/Resident)' }}</li>
                                </ul>
                            </div>

                            <div
                                class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-5 border border-emerald-100 dark:border-emerald-800">
                                <h3
                                    class="font-semibold text-emerald-900 dark:text-emerald-200 mb-2 flex items-center gap-2">
                                    <i class="ti-building text-emerald-600 dark:text-emerald-400"></i>
                                    {{ lang === 'TH' ? 'ข้อมูลทรัพย์สินและสัญญา' : 'Property & Lease Data' }}
                                </h3>
                                <ul
                                    class="list-disc list-inside text-emerald-800 dark:text-emerald-300 space-y-1 text-sm">
                                    <li>{{ lang === 'TH' ? 'ข้อมูลโครงการและยูนิต' : 'Property and unit information' }}
                                    </li>
                                    <li>{{ lang === 'TH' ? 'รายละเอียดสัญญาเช่า' : 'Lease agreement details' }}</li>
                                    <li>{{ lang === 'TH' ? 'เอกสารยืนยันตัวตน' : 'Identity verification documents' }}
                                    </li>
                                </ul>
                            </div>

                            <div
                                class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-5 border border-purple-100 dark:border-purple-800">
                                <h3
                                    class="font-semibold text-purple-900 dark:text-purple-200 mb-2 flex items-center gap-2">
                                    <i class="ti-credit-card text-purple-600 dark:text-purple-400"></i>
                                    {{ lang === 'TH' ? 'ข้อมูลการเงิน' : 'Financial Information' }}
                                </h3>
                                <ul
                                    class="list-disc list-inside text-purple-800 dark:text-purple-300 space-y-1 text-sm">
                                    <li>{{ lang === 'TH' ? 'ประวัติการชำระเงิน' : 'Payment history' }}</li>
                                    <li>{{ lang === 'TH' ? 'หลักฐานการโอนเงิน' : 'Transfer evidence' }}</li>
                                    <li>{{ lang === 'TH' ? 'ข้อมูลการสมัครแพ็กเกจ (ผ่าน Stripe)'
                                        : 'Subscription info (via Stripe)' }}</li>
                                </ul>
                            </div>

                            <div
                                class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-100 dark:border-amber-800">
                                <h3
                                    class="font-semibold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-2">
                                    <i class="ti-message text-amber-600 dark:text-amber-400"></i>
                                    {{ lang === 'TH' ? 'ข้อมูลการสื่อสาร' : 'Communication Data' }}
                                </h3>
                                <ul class="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-1 text-sm">
                                    <li>{{ lang === 'TH' ? 'ข้อความในระบบแชต' : 'Chat messages' }}</li>
                                    <li>{{ lang === 'TH' ? 'คำร้องแจ้งซ่อมและรูปภาพ' : 'Maintenance requests and images'
                                    }}</li>
                                    <li>{{ lang === 'TH' ? 'การแจ้งเตือนและ Push Notification'
                                        : 'Notifications and Push Notifications' }}</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <!-- How We Use -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '3. วิธีการใช้ข้อมูล' : '3. How We Use Information' }}
                        </h2>
                        <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                            <li>{{ lang === 'TH' ? 'ให้บริการระบบจัดการอสังหาริมทรัพย์'
                                : 'Provide property management services' }}</li>
                            <li>{{ lang === 'TH' ? 'ประมวลผลการชำระเงินและออกบิล' : 'Process payments and billing' }}
                            </li>
                            <li>{{ lang === 'TH' ? 'แจ้งเตือนเกี่ยวกับสัญญา บิล และงานซ่อม'
                                : 'Notify about leases, bills, and maintenance' }}</li>
                            <li>{{ lang === 'TH' ? 'อำนวยความสะดวกในการสื่อสารระหว่างผู้จัดการและผู้อยู่อาศัย' :
                                'Facilitate communication between managers and residents' }}</li>
                            <li>{{ lang === 'TH' ? 'วิเคราะห์และปรับปรุงบริการ' : 'Analyze and improve services' }}</li>
                            <li>{{ lang === 'TH' ? 'ปฏิบัติตามข้อกำหนดทางกฎหมาย' : 'Comply with legal requirements' }}
                            </li>
                        </ul>
                    </section>

                    <!-- Data Security -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '4. การรักษาความปลอดภัยของข้อมูล' : '4. Data Security' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                            {{ lang === 'TH'
                                ? 'เราใช้มาตรการรักษาความปลอดภัยที่เหมาะสมเพื่อปกป้องข้อมูลของท่าน:'
                                : 'We use appropriate security measures to protect your data:' }}
                        </p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                                <i class="ti-lock text-primary-600 dark:text-primary-400 mt-0.5"></i>
                                <div>
                                    <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ lang === 'TH' ?
                                        'การเข้ารหัส' : 'Encryption' }}</h4>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ lang === 'TH' ?
                                        'รหัสผ่านและข้อมูลสำคัญถูกเข้ารหัส'
                                        : 'Passwords and sensitive data are encrypted' }}</p>
                                </div>
                            </div>
                            <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                                <i class="ti-shield text-primary-600 dark:text-primary-400 mt-0.5"></i>
                                <div>
                                    <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ lang === 'TH' ?
                                        'JWT Authentication' : 'JWT Authentication' }}</h4>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ lang === 'TH' ?
                                        'ระบบยืนยันตัวตนที่ปลอดภัย' : 'Secure authentication system' }}</p>
                                </div>
                            </div>
                            <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                                <i class="ti-key text-primary-600 dark:text-primary-400 mt-0.5"></i>
                                <div>
                                    <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ lang === 'TH' ?
                                        'Role-based Access' : 'Role-based Access' }}</h4>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ lang === 'TH' ?
                                        'ควบคุมการเข้าถึงตามบทบาท' : 'Access control based on user roles' }}</p>
                                </div>
                            </div>
                            <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                                <i class="ti-credit-card text-primary-600 dark:text-primary-400 mt-0.5"></i>
                                <div>
                                    <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ lang === 'TH' ?
                                        'Stripe PCI Compliance' : 'Stripe PCI Compliance' }}</h4>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ lang === 'TH' ?
                                        'การชำระเงินผ่านมาตรฐาน PCI' : 'Payments via PCI-compliant Stripe' }}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- Data Sharing -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '5. การแบ่งปันข้อมูล' : '5. Data Sharing' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                            {{ lang === 'TH'
                                ? 'เราอาจแบ่งปันข้อมูลกับบุคคลที่สามในกรณีต่อไปนี้:'
                                : 'We may share information with third parties in the following cases:' }}
                        </p>
                        <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                            <li>{{ lang === 'TH' ? 'ผู้ให้บริการชำระเงิน (Stripe) - สำหรับการประมวลผลการชำระเงิน' :
                                'Payment provider (Stripe) - for payment processing' }}</li>
                            <li>{{ lang === 'TH' ? 'เมื่อได้รับคำสั่งจากหน่วยงานรัฐตามกฎหมาย'
                                : 'When required by law enforcement agencies' }}</li>
                            <li>{{ lang === 'TH' ? 'เมื่อได้รับความยินยอมจากท่าน' : 'When you provide consent' }}</li>
                        </ul>
                        <div
                            class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                            <p class="text-green-800 dark:text-green-200 text-sm flex items-center gap-2">
                                <i class="ti-check text-green-600 dark:text-green-400"></i>
                                {{ lang === 'TH' ? 'เราไม่ขายข้อมูลส่วนบุคคลของท่านให้บุคคลที่สาม'
                                    : 'We do not sell your personal data to third parties' }}
                            </p>
                        </div>
                    </section>

                    <!-- Push Notifications -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '6. การแจ้งเตือนแบบ Push' : '6. Push Notifications' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `ระบบใช้ Push Notification ผ่าน Service Worker และ VAPID keys เพื่อแจ้งเตือนเหตุการณ์สำคัญ
                            เช่น ข้อความใหม่ สถานะการชำระเงิน และอัปเดตงานซ่อม
                            ท่านสามารถปิดการแจ้งเตือนได้ในการตั้งค่าของเบราว์เซอร์`
                                : `The system uses Push Notifications via Service Worker and VAPID keys to notify important
                            events such as new messages, payment status, and maintenance updates. You can disable
                            notifications in your browser settings.` }}
                        </p>
                    </section>

                    <!-- Data Retention -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '7. การเก็บรักษาข้อมูล' : '7. Data Retention' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `เราเก็บรักษาข้อมูลของท่านตราบเท่าที่บัญชียังคงใช้งานอยู่ หรือตามที่จำเป็นเพื่อให้บริการ
                            หากท่านต้องการลบบัญชี กรุณาติดต่อเรา และเราจะลบข้อมูลภายใน 30 วัน
                            เว้นแต่ข้อมูลที่ต้องเก็บตามกฎหมาย`
                                : `We retain your data as long as your account is active or as needed to provide services.
                            If you wish to delete your account, please contact us, and we will delete your data within
                            30 days, except data required by law.` }}
                        </p>
                    </section>

                    <!-- User Rights -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '8. สิทธิของผู้ใช้' : '8. User Rights' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                            {{ lang === 'TH' ? 'ท่านมีสิทธิ์ดังต่อไปนี้:' : 'You have the following rights:' }}
                        </p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-eye text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'เข้าถึงข้อมูลส่วนบุคคลของท่าน'
                                    : `Access your personal data` }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-pencil text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'แก้ไขข้อมูลที่ไม่ถูกต้อง' : `Correct
                                    inaccurate data` }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-trash text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'ขอลบข้อมูลส่วนบุคคล' : `Request data deletion`
                                }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-download text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'ขอรับสำเนาข้อมูล' : `Request a copy of your
                                    data` }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-ban text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'คัดค้านการประมวลผลข้อมูล' : `Object to data
                                    processing` }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <i class="ti-bell-off text-primary-500 text-sm"></i>
                                <span class="text-sm">{{ lang === 'TH' ? 'ยกเลิกการรับการแจ้งเตือน' : `Opt-out of
                                    notifications` }}</span>
                            </div>
                        </div>
                    </section>

                    <!-- Cookies -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '9. คุกกี้และ Local Storage' : '9. Cookies & Local Storage' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `ระบบใช้ Local Storage เพื่อเก็บข้อมูลการเข้าสู่ระบบ (JWT Token) และการตั้งค่าส่วนตัว
                            (ธีม, ภาษา) เพื่อให้ท่านไม่ต้องเข้าสู่ระบบซ้ำทุกครั้ง
                            ข้อมูลเหล่านี้เก็บไว้ในเบราว์เซอร์ของท่านเท่านั้น`
                                : `The system uses Local Storage to store login data (JWT Token) and personal settings
                            (theme, language) so you don't have to log in repeatedly. This data is stored only in your
                            browser.` }}
                        </p>
                    </section>

                    <!-- Changes to Policy -->
                    <section class="mb-8 privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '10. การเปลี่ยนแปลงนโยบาย' : '10. Changes to Policy' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {{ lang === 'TH'
                                ? `เราอาจปรับปรุงนโยบายความเป็นส่วนตัวนี้เป็นครั้งคราว
                            การเปลี่ยนแปลงจะประกาศบนหน้านี้พร้อมวันที่อัปเดต หากมีการเปลี่ยนแปลงสำคัญ
                            เราจะแจ้งให้ท่านทราบผ่านอีเมลหรือการแจ้งเตือนในระบบ`
                                : `We may update this Privacy Policy from time to time. Changes will be posted on this page
                            with the update date.If there are significant changes, we will notify you via email or
                            in -app notification.` }}
                        </p>
                    </section>

                    <!-- Contact -->
                    <section class="privacy-section">
                        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            {{ lang === 'TH' ? '11. ติดต่อเรา' : '11. Contact Us' }}
                        </h2>
                        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                            {{ lang === 'TH'
                                ? 'หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวหรือต้องการใช้สิทธิ์ของท่าน:'
                                : 'If you have questions about this Privacy Policy or wish to exercise your rights:' }}
                        </p>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-5">
                            <div class="flex items-center gap-3 mb-3">
                                <i class="ti-email text-primary-600 dark:text-primary-400"></i>
                                <span class="text-gray-700 dark:text-gray-300">support@propmanager.com</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <i class="ti-message text-primary-600 dark:text-primary-400"></i>
                                <span class="text-gray-700 dark:text-gray-300">{{ lang === 'TH' ? 'ระบบแชทในแอปพลิเคชัน'
                                    : 'In-app chat system' }}</span>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Back link -->
                <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 text-center privacy-back">
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
