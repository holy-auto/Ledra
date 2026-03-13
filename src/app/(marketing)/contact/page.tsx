import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata = {
  title: "お問い合わせ",
  description: "CARTRUSTへのお問い合わせ。導入のご相談、資料請求、デモのご依頼など、お気軽にご連絡ください。",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        badge="CONTACT"
        title="お問い合わせ"
        subtitle="導入のご相談、資料請求、デモのご依頼など、お気軽にお問い合わせください。"
      />

      <Section>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">
          {/* Contact info */}
          <ScrollReveal variant="fade-right" delay={0} className="md:col-span-2">
            <div>
              <h2 className="text-xl font-bold text-heading">お問い合わせ方法</h2>
              <div className="mt-8 space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-primary">
                      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-heading">メール</div>
                    <div className="mt-1 text-sm text-muted">info@cartrust.jp</div>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-primary">
                      <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-heading">電話</div>
                    <div className="mt-1 text-sm text-muted">03-XXXX-XXXX</div>
                    <div className="text-xs text-muted">平日 9:00 - 18:00</div>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-primary">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-heading">対応時間</div>
                    <div className="mt-1 text-sm text-muted">通常1営業日以内にご返信いたします</div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Form */}
          <ScrollReveal variant="fade-left" delay={100} className="md:col-span-3">
            <ContactForm />
          </ScrollReveal>
        </div>
      </Section>
    </>
  );
}
