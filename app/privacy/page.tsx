

// app/privacy/page.tsx

import BackLink from 'components/BackLink';

export const metadata = {
  title: 'Privacy Policy – TrimZi',
  description: 'How TrimZi collects, uses and protects your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-ivory text-brown">
      <div className="mx-auto max-w-[720px] px-4 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
          <p className="text-sm text-brown/70">
            Last updated: {new Date().getFullYear()}
          </p>
        </header>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-3 text-sm leading-relaxed">
          <p>
            This Privacy Policy explains how <strong>TrimZi</strong> (&quot;we&quot;,
            &quot;us&quot;, &quot;our&quot;) collects, uses and protects your
            information when you use our website and booking app (together,
            the &quot;Service&quot;).
          </p>
          <p>
            TrimZi is operated in the United Kingdom (Scotland) and currently
            helps you book barbering services with local providers such as
            Kelvinhair.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">1. Information we collect</h2>
          <p>We collect and process:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account details</strong> – name, email address and password
              (for email sign-up), or basic profile information from your sign-in
              provider (e.g. Google).
            </li>
            <li>
              <strong>Contact details</strong> – your mobile number so barbers can
              contact you about your booking if needed.
            </li>
            <li>
              <strong>Booking information</strong> – services booked, time, date,
              barber, price and related notes.
            </li>
            <li>
              <strong>Payment information</strong> – card payments are processed
              via our payment provider <strong>Square</strong>. We do not store
              full card numbers on TrimZi; they are handled securely by Square.
            </li>
            <li>
              <strong>Technical information</strong> – basic device, log and usage
              data (for example, pages viewed and the browser you use) to help
              operate and improve the Service.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">2. How we use your information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Create and manage your TrimZi account and profile.</li>
            <li>Allow you to make, view and manage bookings.</li>
            <li>
              Share essential booking details (name, time, service, contact
              number) with your chosen barber so they can provide the service.
            </li>
            <li>
              Send booking confirmations, reminders and important service
              messages by email and/or SMS.
            </li>
            <li>
              Take and process payments for services you choose to pay for
              online, via Square.
            </li>
            <li>
              Maintain the security and reliability of the Service and detect or
              prevent fraud or abuse.
            </li>
            <li>
              Where you have chosen to receive them, send you news and offers.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">3. Legal bases (UK GDPR)</h2>
          <p>We rely on the following legal bases to process your data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Contract</strong> – to provide the booking service you
              request (e.g. creating bookings, sharing details with barbers).
            </li>
            <li>
              <strong>Legitimate interests</strong> – to keep TrimZi secure,
              understand usage and improve our service in a way that respects
              your privacy.
            </li>
            <li>
              <strong>Consent</strong> – where required, for optional
              communications such as marketing emails. You can change these
              preferences in your Profile.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">4. Sharing your information</h2>
          <p>We may share your information with:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Barbers / salons</strong> – to fulfil your bookings (for
              example, Kelvinhair receives your name, appointment time and
              contact details).
            </li>
            <li>
              <strong>Payment providers</strong> – primarily Square, to process
              your card payments.
            </li>
            <li>
              <strong>Service providers</strong> – including hosting, database,
              analytics and communication providers (for example, Firebase).
            </li>
            <li>
              <strong>Authorities</strong> – where required by law or to protect
              our rights or the rights of others.
            </li>
          </ul>
          <p>
            We do not sell your personal data. We only share what is necessary
            to operate the Service.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">5. Data storage & retention</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              We store your data primarily in the UK/EU or with providers that
              offer adequate protections under UK data protection law.
            </li>
            <li>
              We keep your profile and booking history while you have an account
              and for a reasonable period afterwards for record-keeping and
              legal purposes.
            </li>
            <li>
              You can ask us to delete your account and associated data, subject
              to what we must keep for legal or regulatory reasons.
            </li>
          </ul>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">6. Your rights</h2>
          <p>
            Under UK data protection law you may have the right to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the personal data we hold about you.</li>
            <li>Ask us to correct inaccurate or incomplete data.</li>
            <li>Ask us to delete your data in certain circumstances.</li>
            <li>
              Object to or restrict certain types of processing (for example,
              direct marketing).
            </li>
            <li>Request a copy of your data in a portable format.</li>
          </ul>
          <p>
            To exercise these rights, please contact us using the details below.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">7. Cookies & analytics</h2>
          <p>
            We may use cookies and similar technologies to help the app work
            reliably, keep you signed in and understand usage. You can control
            cookies through your browser settings, but some features may not
            work correctly if you disable them.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-brown/10 p-4 space-y-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-brown">8. Contact</h2>
          <p>
            If you have any questions about this Privacy Policy or how your data
            is handled, please contact:
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
