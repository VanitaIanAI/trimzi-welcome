// app/terms/page.tsx

import BackLink from 'components/BackLink';

export const metadata = {
  title: 'Terms of Use – TrimZi',
  description: 'Terms and conditions for using TrimZi.',
};

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-ivory text-brown">
      <div className="mx-auto max-w-[720px] px-4 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold">Terms of Use</h1>
          <p className="text-sm text-brown/70">
            Last updated: {new Date().getFullYear()}
          </p>
        </header>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-3 text-sm leading-relaxed">
          <p>
            These Terms of Use (&quot;Terms&quot;) govern your access to and use
            of the <strong>TrimZi</strong> website and booking app (the
            &quot;Service&quot;). By using TrimZi you agree to these Terms.
          </p>
          <p>
            TrimZi currently operates in the United Kingdom (Scotland) and
            allows you to book barbering services with independent providers
            such as Kelvinhair.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">1. Using TrimZi</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              You must be at least 18, or have permission from a parent/guardian,
              to use TrimZi.
            </li>
            <li>
              You are responsible for keeping your account details and login
              information confidential.
            </li>
            <li>
              You agree that the information you provide (for example your name
              and contact details) is accurate and kept up to date.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">2. Bookings</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              TrimZi provides the booking platform; the actual services are
              delivered by independent barbers/salons.
            </li>
            <li>
              When you make a booking, you are entering into an agreement with
              the barber/salon providing the service, not with TrimZi.
            </li>
            <li>
              Please check the date, time and service carefully before
              confirming, and arrive on time for your appointment.
            </li>
            <li>
              Where cancellation or rescheduling is available, it will be shown
              in the app. Some late cancellations or no-shows may be charged in
              line with the barber&apos;s policies.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">3. Payments</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              TrimZi may allow you to pay for services online at the time of
              booking. Online payments are processed securely by{' '}
              <strong>Square</strong> (Squareup) on behalf of the barber or
              salon.
            </li>
            <li>
              TrimZi does not store full card numbers. Card data is handled by
              Square in accordance with their own security and privacy
              standards.
            </li>
            <li>
              Prices shown in the app are set by the barber/salon and may change
              from time to time. We try to keep them accurate but cannot
              guarantee availability or price until a booking is confirmed.
            </li>
            <li>
              Any refunds for card payments are normally processed back to the
              original payment method, subject to the barber&apos;s cancellation
              policy.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">4. Our role & responsibility</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              We provide the technology that helps you discover barbers and make
              bookings. We do not provide barbering services ourselves.
            </li>
            <li>
              We are not responsible for the quality, safety or outcome of any
              service provided by barbers/salons booked through TrimZi.
            </li>
            <li>
              However, we want TrimZi to work well. If you have issues with the
              app or booking flow, please contact us and we&apos;ll try to help.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">5. Your responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the app in a lawful and reasonable way.</li>
            <li>Do not misuse the Service, attempt to hack it or disrupt it.</li>
            <li>
              Respect barbers&apos; time – cancel or reschedule as early as
              possible if you cannot attend.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">6. App availability & changes</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              We aim to keep TrimZi available and running smoothly, but we cannot
              guarantee uninterrupted or error-free operation.
            </li>
            <li>
              We may update or change features from time to time, or suspend the
              Service for maintenance or security reasons.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">7. Limitation of liability</h2>
          <p>
            Nothing in these Terms excludes or limits any liability that cannot
            be excluded under UK law.
          </p>
          <p>
            As far as the law allows, TrimZi will not be liable for any loss or
            damage arising from:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              services provided to you by barbers/salons booked through the app;
            </li>
            <li>your misuse of the Service;</li>
            <li>
              events beyond our reasonable control (for example, network
              outages).
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">8. Governing law</h2>
          <p>
            These Terms are governed by the laws of Scotland, and any disputes
            will be subject to the non-exclusive jurisdiction of the Scottish
            courts.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">9. Contact</h2>
          <p>
            If you have questions about these Terms, please contact us at:
          </p>
          <p className="text-sm text-brown/80">
            Email: <span className="font-mono">support@trimzi.co.uk</span>
          </p>
        </section>

           <section className="text-sm text-brown/70">
          <BackLink>Back</BackLink>
        </section>
      </div>
    </main>
  );
}
