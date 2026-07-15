import { SectionTag } from "holy-cert";

export function Default() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SectionTag>証明書</SectionTag>
      <SectionTag>顧客管理</SectionTag>
      <SectionTag>今月の実績</SectionTag>
    </div>
  );
}
