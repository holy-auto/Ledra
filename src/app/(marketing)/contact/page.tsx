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
              <h2 className="text-xl font-bold text-white">お問い合わせ方法</h2>
              <div className="mt-8 space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/[0.1] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-blue-400">
                      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">メール</div>
                    <div className="mt-1 text-sm text-white/55">info@cartrust.co.jp</div>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/[0.1] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-blue-400">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">対応時間</div>
                    <div className="mt-1 text-sm text-white/55">通常1営業日以内にご返信いたします</div>
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
