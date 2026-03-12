import { Container } from "./Container";
import { Badge } from "./Badge";
import { CTAButton } from "./CTAButton";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#f0f4ff] via-white to-white">
      {/* Decorative elements - subtle geometric pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-[10%] w-72 h-72 bg-primary/[0.04] rounded-full blur-3xl" />
        <div className="absolute top-40 right-[10%] w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-white to-transparent" />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(11,92,186,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(11,92,186,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <Container className="relative text-center py-32 md:py-44 lg:py-52">
        <Badge>WEB施工証明書SaaS</Badge>
        <h1 className="mt-8 text-[2.25rem] md:text-[3.5rem] lg:text-[4rem] font-bold leading-[1.15] tracking-tight text-heading">
          施工証明をデジタルで。
          <br />
          <span className="bg-gradient-to-r from-primary to-[#2b7de9] bg-clip-text text-transparent">
            信頼を、かんたんに。
          </span>
        </h1>
        <p className="mt-8 text-lg md:text-xl leading-relaxed text-body/80 max-w-2xl mx-auto">
          CARTRUSTは、自動車の施工記録をデジタル証明書として発行・管理できるプラットフォームです。
          施工店の業務効率化と、保険会社の査定精度向上を同時に実現します。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <CTAButton variant="primary" href="/contact">
            無料で始める
          </CTAButton>
          <CTAButton variant="outline" href="/contact">
            資料請求
          </CTAButton>
        </div>
        {/* Social proof line */}
        <p className="mt-16 text-sm text-muted">
          すでに<span className="font-semibold text-heading">500社以上</span>の施工店・保険会社にご利用いただいています
        </p>
      </Container>
    </section>
  );
}
