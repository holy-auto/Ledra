import React from "react";
import { registerRoot, Composition } from "remotion";
import { Slideshow, totalFrames } from "./Slideshow";

// ── 説明会 ────────────────────────────────────────────────────────────
import { LedraVideo } from "./LedraVideo";

// ── 短尺プロダクトツアー (LP/商談/SNS) ────────────────────────────────
import { ProductTourVideo, PRODUCT_TOUR_FRAMES } from "./ProductTour";

// ── Admin オンボーディング ─────────────────────────────────────────────
import { AdminWelcome } from "./slides/admin-onboarding/Welcome";
import { AdminInitialSetup } from "./slides/admin-onboarding/InitialSetup";
import { AdminRegisterData } from "./slides/admin-onboarding/RegisterData";
import { AdminFirstCertificate } from "./slides/admin-onboarding/FirstCertificate";
import { AdminFirstInvoice } from "./slides/admin-onboarding/FirstInvoice";
import { AdminNextSteps } from "./slides/admin-onboarding/NextSteps";

// ── Insurer オンボーディング ───────────────────────────────────────────
import { InsurerWelcome } from "./slides/insurer-onboarding/Welcome";
import { InsurerSearchCertificate } from "./slides/insurer-onboarding/SearchCertificate";
import { InsurerCaseManagement } from "./slides/insurer-onboarding/CaseManagement";
import { InsurerTeamAndAnalytics } from "./slides/insurer-onboarding/TeamAndAnalytics";

// ── Agent オンボーディング ─────────────────────────────────────────────
import { AgentWelcome } from "./slides/agent-onboarding/Welcome";
import { AgentReferralLink } from "./slides/agent-onboarding/ReferralLink";
import { AgentRegisterReferral } from "./slides/agent-onboarding/RegisterReferral";
import { AgentCommissionAndGrowth } from "./slides/agent-onboarding/CommissionAndGrowth";

// ── 証明書 深掘り ──────────────────────────────────────────────────────
import { CertStructure } from "./slides/certificate-deep/Structure";
import { CertOCRAndPhotos } from "./slides/certificate-deep/OCRAndPhotos";
import { CertQRAndURL } from "./slides/certificate-deep/QRAndURL";
import { CertBlockchain } from "./slides/certificate-deep/Blockchain";
import { CertBatchAndExport } from "./slides/certificate-deep/BatchAndExport";

// ── Admin 完全ガイド ───────────────────────────────────────────────────
import { AdminFullIntro as AdminIntro } from "./slides/admin-full/00_Intro";
import { Ch1Divider } from "./slides/admin-full/01_Ch1_Divider";
import { DashboardKPI } from "./slides/admin-full/02_Dashboard_KPI";
import { DashboardWidgets } from "./slides/admin-full/03_Dashboard_Widgets";
import { Ch2Divider } from "./slides/admin-full/04_Ch2_Divider";
import { CertList } from "./slides/admin-full/05_Cert_List";
import { CertIssue } from "./slides/admin-full/06_Cert_Issue";
import { CertOps } from "./slides/admin-full/07_Cert_Ops";
import { Ch3Divider } from "./slides/admin-full/08_Ch3_Divider";
import { VehicleRegister } from "./slides/admin-full/09_Vehicle_Register";
import { VehicleTimeline } from "./slides/admin-full/10_Vehicle_Timeline";
import { Customer360 } from "./slides/admin-full/11_Customer_360";
import { Ch4Divider } from "./slides/admin-full/12_Ch4_Divider";
import { ReservationMgmt } from "./slides/admin-full/13_Reservation_Mgmt";
import { JobWorkflow } from "./slides/admin-full/14_Job_Workflow";
import { WalkInJob } from "./slides/admin-full/15_WalkIn_Job";
import { Ch5Divider } from "./slides/admin-full/16_Ch5_Divider";
import { Invoice } from "./slides/admin-full/17_Invoice";
import { POSSquare } from "./slides/admin-full/18_POS_Square";
import { Analytics } from "./slides/admin-full/19_Analytics";
import { Ch6Divider } from "./slides/admin-full/20_Ch6_Divider";
import { BtoBFull } from "./slides/admin-full/21_BtoB";
import { Ch7Divider } from "./slides/admin-full/22_Ch7_Divider";
import { SettingsMembers } from "./slides/admin-full/23_Settings_Members";
import { SecurityBilling } from "./slides/admin-full/24_Security_Billing";

// ── ワークフロー 深掘り ────────────────────────────────────────────────
import { WorkflowOverview } from "./slides/workflow-deep/Overview";
import { WorkflowStatusStepper } from "./slides/workflow-deep/StatusStepper";
import { WorkflowWalkIn } from "./slides/workflow-deep/WalkIn";
import { WorkflowDuplicateGuard } from "./slides/workflow-deep/DuplicateGuard";
import { WorkflowContextCarryover } from "./slides/workflow-deep/ContextCarryover";

// ── Insurer 完全ガイド ─────────────────────────────────────────────────
import { InsurerFullIntro } from "./slides/insurer-full/00_Intro";
import { InsurerCh1Divider } from "./slides/insurer-full/01_Ch1_Divider";
import { SearchBasic } from "./slides/insurer-full/02_Search_Basic";
import { SearchVehicle } from "./slides/insurer-full/03_Search_Vehicle";
import { CertDetail } from "./slides/insurer-full/04_Cert_Detail";
import { Watchlist } from "./slides/insurer-full/05_Watchlist";
import { InsurerCh2Divider } from "./slides/insurer-full/06_Ch2_Divider";
import { CaseCreate } from "./slides/insurer-full/07_Case_Create";
import { CaseBulk } from "./slides/insurer-full/08_Case_Bulk";
import { TemplatesRules } from "./slides/insurer-full/09_Templates_Rules";
import { SLAManagement } from "./slides/insurer-full/10_SLA";
import { InsurerCh3Divider } from "./slides/insurer-full/11_Ch3_Divider";
import { InsurerAnalytics } from "./slides/insurer-full/12_Analytics";
import { ReportsExport } from "./slides/insurer-full/13_Reports_Export";
import { InsurerCh4Divider } from "./slides/insurer-full/14_Ch4_Divider";
import { InsurerUsers } from "./slides/insurer-full/15_Users";
import { AuditNotifications } from "./slides/insurer-full/16_Audit_Notifications";
import { InsurerSecurity } from "./slides/insurer-full/17_Security";

// ── Admin オンボーディング V2 (実画面) ────────────────────────────────
import { AdminV2Intro }           from "./slides/admin-onboarding-v2/00_Intro";
import { AdminV2Ch1Divider }      from "./slides/admin-onboarding-v2/01_Ch1_Divider";
import { AdminV2Login }           from "./slides/admin-onboarding-v2/02_Login";
import { AdminV2Dashboard }       from "./slides/admin-onboarding-v2/03_Dashboard";
import { AdminV2DashboardWidgets }from "./slides/admin-onboarding-v2/04_DashboardWidgets";
import { AdminV2Ch2Divider }      from "./slides/admin-onboarding-v2/05_Ch2_Divider";
import { AdminV2CertList }        from "./slides/admin-onboarding-v2/06_CertList";
import { AdminV2CertIssue }       from "./slides/admin-onboarding-v2/07_CertIssue";
import { AdminV2CertDetail }      from "./slides/admin-onboarding-v2/08_CertDetail";
import { AdminV2Ch3Divider }      from "./slides/admin-onboarding-v2/09_Ch3_Divider";
import { AdminV2VehicleList }     from "./slides/admin-onboarding-v2/10_VehicleList";
import { AdminV2VehicleNew }      from "./slides/admin-onboarding-v2/11_VehicleNew";
import { AdminV2CustomerList }    from "./slides/admin-onboarding-v2/12_CustomerList";
import { AdminV2CustomerDetail }  from "./slides/admin-onboarding-v2/13_CustomerDetail";
import { AdminV2Ch4Divider }      from "./slides/admin-onboarding-v2/14_Ch4_Divider";
import { AdminV2Reservations }    from "./slides/admin-onboarding-v2/15_Reservations";
import { AdminV2JobWorkflow }     from "./slides/admin-onboarding-v2/16_JobWorkflow";
import { AdminV2Ch5Divider }      from "./slides/admin-onboarding-v2/17_Ch5_Divider";
import { AdminV2POS }             from "./slides/admin-onboarding-v2/18_POS";
import { AdminV2Billing }         from "./slides/admin-onboarding-v2/19_Billing";
import { AdminV2Ch6Divider }      from "./slides/admin-onboarding-v2/20_Ch6_Divider";
import { AdminV2Settings }        from "./slides/admin-onboarding-v2/21_Settings";
import { AdminV2Members }         from "./slides/admin-onboarding-v2/22_Members";
import { AdminV2Outro }           from "./slides/admin-onboarding-v2/23_Outro";

// ── Insurer オンボーディング V2 (実画面) ──────────────────────────────
import { InsurerV2Intro }         from "./slides/insurer-onboarding-v2/00_Intro";
import { InsurerV2Ch1Divider }    from "./slides/insurer-onboarding-v2/01_Ch1_Divider";
import { InsurerV2Login }         from "./slides/insurer-onboarding-v2/02_Login";
import { InsurerV2Dashboard }     from "./slides/insurer-onboarding-v2/03_Dashboard";
import { InsurerV2Search }        from "./slides/insurer-onboarding-v2/04_Search";
import { InsurerV2CertDetail }    from "./slides/insurer-onboarding-v2/05_CertDetail";
import { InsurerV2VehicleSearch } from "./slides/insurer-onboarding-v2/06_VehicleSearch";
import { InsurerV2Ch2Divider }    from "./slides/insurer-onboarding-v2/07_Ch2_Divider";
import { InsurerV2CaseList }      from "./slides/insurer-onboarding-v2/08_CaseList";
import { InsurerV2CaseCreate }    from "./slides/insurer-onboarding-v2/09_CaseCreate";
import { InsurerV2CaseBulk }      from "./slides/insurer-onboarding-v2/10_CaseBulk";
import { InsurerV2Ch3Divider }    from "./slides/insurer-onboarding-v2/11_Ch3_Divider";
import { InsurerV2Analytics }     from "./slides/insurer-onboarding-v2/12_Analytics";
import { InsurerV2Reports }       from "./slides/insurer-onboarding-v2/13_Reports";
import { InsurerV2Ch4Divider }    from "./slides/insurer-onboarding-v2/14_Ch4_Divider";
import { InsurerV2Users }         from "./slides/insurer-onboarding-v2/15_Users";
import { InsurerV2Outro }         from "./slides/insurer-onboarding-v2/16_Outro";

// ── Agent オンボーディング V2 (実画面) ────────────────────────────────
import { AgentV2Intro }           from "./slides/agent-onboarding-v2/00_Intro";
import { AgentV2Ch1Divider }      from "./slides/agent-onboarding-v2/01_Ch1_Divider";
import { AgentV2Login }           from "./slides/agent-onboarding-v2/02_Login";
import { AgentV2Dashboard }       from "./slides/agent-onboarding-v2/03_Dashboard";
import { AgentV2Ch2Divider }      from "./slides/agent-onboarding-v2/04_Ch2_Divider";
import { AgentV2ReferralList }    from "./slides/agent-onboarding-v2/05_ReferralList";
import { AgentV2ReferralNew }     from "./slides/agent-onboarding-v2/06_ReferralNew";
import { AgentV2ReferralTracking }from "./slides/agent-onboarding-v2/07_ReferralTracking";
import { AgentV2Ch3Divider }      from "./slides/agent-onboarding-v2/08_Ch3_Divider";
import { AgentV2Commissions }     from "./slides/agent-onboarding-v2/09_Commissions";
import { AgentV2Reports }         from "./slides/agent-onboarding-v2/10_Reports";
import { AgentV2Ch4Divider }      from "./slides/agent-onboarding-v2/11_Ch4_Divider";
import { AgentV2Training }        from "./slides/agent-onboarding-v2/12_Training";
import { AgentV2Materials }       from "./slides/agent-onboarding-v2/13_Materials";
import { AgentV2Outro }           from "./slides/agent-onboarding-v2/14_Outro";

// ── Agent 完全ガイド ───────────────────────────────────────────────────
import { AgentFullIntro } from "./slides/agent-full/00_Intro";
import { AgentCh1Divider } from "./slides/agent-full/01_Ch1_Divider";
import { ApplyProcess } from "./slides/agent-full/02_Apply_Process";
import { AccountSetup } from "./slides/agent-full/03_Account_Setup";
import { AgentCh2Divider } from "./slides/agent-full/04_Ch2_Divider";
import { ReferralLinks } from "./slides/agent-full/05_Referral_Links";
import { ReferralRegister } from "./slides/agent-full/06_Referral_Register";
import { ReferralTracking } from "./slides/agent-full/07_Referral_Tracking";
import { AgentCh3Divider } from "./slides/agent-full/08_Ch3_Divider";
import { CommissionDetail } from "./slides/agent-full/09_Commission_Detail";
import { ReportsRankings } from "./slides/agent-full/10_Reports_Rankings";
import { Campaigns } from "./slides/agent-full/11_Campaigns";
import { AgentCh4Divider } from "./slides/agent-full/12_Ch4_Divider";
import { Training } from "./slides/agent-full/13_Training";
import { MaterialsShared } from "./slides/agent-full/14_Materials_Shared";
import { SupportNotifications } from "./slides/agent-full/15_Support_Notifications";

// ── V2 ラッパーコンポーネント ──────────────────────────────────────────
// 900 + 6×450 + 16×3000 + 900 = 52500f ≈ 29 min
const AdminOnboardingV2Video: React.FC = () => (
  <Slideshow slides={[
    { component: AdminV2Intro,            frames: 900  },
    { component: AdminV2Ch1Divider,       frames: 450  },
    { component: AdminV2Login,            frames: 3000 },
    { component: AdminV2Dashboard,        frames: 3000 },
    { component: AdminV2DashboardWidgets, frames: 3000 },
    { component: AdminV2Ch2Divider,       frames: 450  },
    { component: AdminV2CertList,         frames: 3000 },
    { component: AdminV2CertIssue,        frames: 3000 },
    { component: AdminV2CertDetail,       frames: 3000 },
    { component: AdminV2Ch3Divider,       frames: 450  },
    { component: AdminV2VehicleList,      frames: 3000 },
    { component: AdminV2VehicleNew,       frames: 3000 },
    { component: AdminV2CustomerList,     frames: 3000 },
    { component: AdminV2CustomerDetail,   frames: 3000 },
    { component: AdminV2Ch4Divider,       frames: 450  },
    { component: AdminV2Reservations,     frames: 3000 },
    { component: AdminV2JobWorkflow,      frames: 3000 },
    { component: AdminV2Ch5Divider,       frames: 450  },
    { component: AdminV2POS,              frames: 3000 },
    { component: AdminV2Billing,          frames: 3000 },
    { component: AdminV2Ch6Divider,       frames: 450  },
    { component: AdminV2Settings,         frames: 3000 },
    { component: AdminV2Members,          frames: 3000 },
    { component: AdminV2Outro,            frames: 900  },
  ]} />
);

// 900 + 4×450 + 11×3000 + 900 = 36600f ≈ 20 min
const InsurerOnboardingV2Video: React.FC = () => (
  <Slideshow slides={[
    { component: InsurerV2Intro,         frames: 900  },
    { component: InsurerV2Ch1Divider,    frames: 450  },
    { component: InsurerV2Login,         frames: 3000 },
    { component: InsurerV2Dashboard,     frames: 3000 },
    { component: InsurerV2Search,        frames: 3000 },
    { component: InsurerV2CertDetail,    frames: 3000 },
    { component: InsurerV2VehicleSearch, frames: 3000 },
    { component: InsurerV2Ch2Divider,    frames: 450  },
    { component: InsurerV2CaseList,      frames: 3000 },
    { component: InsurerV2CaseCreate,    frames: 3000 },
    { component: InsurerV2CaseBulk,      frames: 3000 },
    { component: InsurerV2Ch3Divider,    frames: 450  },
    { component: InsurerV2Analytics,     frames: 3000 },
    { component: InsurerV2Reports,       frames: 3000 },
    { component: InsurerV2Ch4Divider,    frames: 450  },
    { component: InsurerV2Users,         frames: 3000 },
    { component: InsurerV2Outro,         frames: 900  },
  ]} />
);

// 900 + 4×450 + 9×3000 + 900 = 30600f ≈ 17 min
const AgentOnboardingV2Video: React.FC = () => (
  <Slideshow slides={[
    { component: AgentV2Intro,            frames: 900  },
    { component: AgentV2Ch1Divider,       frames: 450  },
    { component: AgentV2Login,            frames: 3000 },
    { component: AgentV2Dashboard,        frames: 3000 },
    { component: AgentV2Ch2Divider,       frames: 450  },
    { component: AgentV2ReferralList,     frames: 3000 },
    { component: AgentV2ReferralNew,      frames: 3000 },
    { component: AgentV2ReferralTracking, frames: 3000 },
    { component: AgentV2Ch3Divider,       frames: 450  },
    { component: AgentV2Commissions,      frames: 3000 },
    { component: AgentV2Reports,          frames: 3000 },
    { component: AgentV2Ch4Divider,       frames: 450  },
    { component: AgentV2Training,         frames: 3000 },
    { component: AgentV2Materials,        frames: 3000 },
    { component: AgentV2Outro,            frames: 900  },
  ]} />
);

// ─────────────────────────────────────────────────────────────────────
// ラッパーコンポーネント
// defaultProps にコンポーネント参照（関数）を入れると
// シリアライズ時に undefined になるため、各動画を専用コンポーネントでラップする
// ─────────────────────────────────────────────────────────────────────

const FPS = 30;
const W = 1920;
const H = 1080;
const D = 810; // 27s per slide (short-form default)

const AdminOnboardingVideo: React.FC = () => (
  <Slideshow slides={[
    { component: AdminWelcome },
    { component: AdminInitialSetup },
    { component: AdminRegisterData },
    { component: AdminFirstCertificate },
    { component: AdminFirstInvoice },
    { component: AdminNextSteps },
  ]} defaultFrames={D} />
);

const InsurerOnboardingVideo: React.FC = () => (
  <Slideshow slides={[
    { component: InsurerWelcome },
    { component: InsurerSearchCertificate },
    { component: InsurerCaseManagement },
    { component: InsurerTeamAndAnalytics },
  ]} defaultFrames={D} />
);

const AgentOnboardingVideo: React.FC = () => (
  <Slideshow slides={[
    { component: AgentWelcome },
    { component: AgentReferralLink },
    { component: AgentRegisterReferral },
    { component: AgentCommissionAndGrowth },
  ]} defaultFrames={D} />
);

const CertificateDeepDiveVideo: React.FC = () => (
  <Slideshow slides={[
    { component: CertStructure },
    { component: CertOCRAndPhotos },
    { component: CertQRAndURL },
    { component: CertBlockchain },
    { component: CertBatchAndExport },
  ]} defaultFrames={D} />
);

const WorkflowDeepDiveVideo: React.FC = () => (
  <Slideshow slides={[
    { component: WorkflowOverview },
    { component: WorkflowStatusStepper },
    { component: WorkflowWalkIn },
    { component: WorkflowDuplicateGuard },
    { component: WorkflowContextCarryover },
  ]} defaultFrames={D} />
);

const AdminFullGuideVideo: React.FC = () => (
  <Slideshow slides={[
    { component: AdminIntro,       frames: 900  },
    { component: Ch1Divider,       frames: 450  },
    { component: DashboardKPI,     frames: 1500 },
    { component: DashboardWidgets, frames: 1500 },
    { component: Ch2Divider,       frames: 450  },
    { component: CertList,         frames: 1500 },
    { component: CertIssue,        frames: 1500 },
    { component: CertOps,          frames: 1500 },
    { component: Ch3Divider,       frames: 450  },
    { component: VehicleRegister,  frames: 1500 },
    { component: VehicleTimeline,  frames: 1500 },
    { component: Customer360,      frames: 1500 },
    { component: Ch4Divider,       frames: 450  },
    { component: ReservationMgmt,  frames: 1500 },
    { component: JobWorkflow,      frames: 1500 },
    { component: WalkInJob,        frames: 1500 },
    { component: Ch5Divider,       frames: 450  },
    { component: Invoice,          frames: 1500 },
    { component: POSSquare,        frames: 1500 },
    { component: Analytics,        frames: 1500 },
    { component: Ch6Divider,       frames: 450  },
    { component: BtoBFull,         frames: 1500 },
    { component: Ch7Divider,       frames: 450  },
    { component: SettingsMembers,  frames: 1500 },
    { component: SecurityBilling,  frames: 1500 },
  ]} />
);

// 900 + 450×4 + 1500×13 = 22200f ≈ 12.3 min
const InsurerFullGuideVideo: React.FC = () => (
  <Slideshow slides={[
    { component: InsurerFullIntro,   frames: 900  },
    { component: InsurerCh1Divider,  frames: 450  },
    { component: SearchBasic,        frames: 1500 },
    { component: SearchVehicle,      frames: 1500 },
    { component: CertDetail,         frames: 1500 },
    { component: Watchlist,          frames: 1500 },
    { component: InsurerCh2Divider,  frames: 450  },
    { component: CaseCreate,         frames: 1500 },
    { component: CaseBulk,           frames: 1500 },
    { component: TemplatesRules,     frames: 1500 },
    { component: SLAManagement,      frames: 1500 },
    { component: InsurerCh3Divider,  frames: 450  },
    { component: InsurerAnalytics,   frames: 1500 },
    { component: ReportsExport,      frames: 1500 },
    { component: InsurerCh4Divider,  frames: 450  },
    { component: InsurerUsers,       frames: 1500 },
    { component: AuditNotifications, frames: 1500 },
    { component: InsurerSecurity,    frames: 1500 },
  ]} />
);

// 900 + 450×4 + 1500×11 = 19200f ≈ 10.7 min
const AgentFullGuideVideo: React.FC = () => (
  <Slideshow slides={[
    { component: AgentFullIntro,       frames: 900  },
    { component: AgentCh1Divider,      frames: 450  },
    { component: ApplyProcess,         frames: 1500 },
    { component: AccountSetup,         frames: 1500 },
    { component: AgentCh2Divider,      frames: 450  },
    { component: ReferralLinks,        frames: 1500 },
    { component: ReferralRegister,     frames: 1500 },
    { component: ReferralTracking,     frames: 1500 },
    { component: AgentCh3Divider,      frames: 450  },
    { component: CommissionDetail,     frames: 1500 },
    { component: ReportsRankings,      frames: 1500 },
    { component: Campaigns,            frames: 1500 },
    { component: AgentCh4Divider,      frames: 450  },
    { component: Training,             frames: 1500 },
    { component: MaterialsShared,      frames: 1500 },
    { component: SupportNotifications, frames: 1500 },
  ]} />
);

// ─────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────

export const RemotionRoot: React.FC = () => (
  <>
    {/* 短尺プロダクトツアー — LP/商談/SNS 向け (約28s) */}
    <Composition
      id="ProductTour"
      component={ProductTourVideo}
      durationInFrames={PRODUCT_TOUR_FRAMES}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* 説明会 (10スライド × 27s = 270s = 4.5min) */}
    <Composition
      id="LedraIntro"
      component={LedraVideo}
      durationInFrames={9000}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Admin オンボーディング (6スライド × 27s) */}
    <Composition
      id="AdminOnboarding"
      component={AdminOnboardingVideo}
      durationInFrames={6 * D}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Insurer オンボーディング (4スライド × 27s) */}
    <Composition
      id="InsurerOnboarding"
      component={InsurerOnboardingVideo}
      durationInFrames={4 * D}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Agent オンボーディング (4スライド × 27s) */}
    <Composition
      id="AgentOnboarding"
      component={AgentOnboardingVideo}
      durationInFrames={4 * D}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* 証明書 深掘り (5スライド × 27s) */}
    <Composition
      id="CertificateDeepDive"
      component={CertificateDeepDiveVideo}
      durationInFrames={5 * D}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* ワークフロー 深掘り (5スライド × 27s) */}
    <Composition
      id="WorkflowDeepDive"
      component={WorkflowDeepDiveVideo}
      durationInFrames={5 * D}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Admin 完全ガイド (長尺 約17分) */}
    <Composition
      id="AdminFullGuide"
      component={AdminFullGuideVideo}
      durationInFrames={900 + 450 * 7 + 1500 * 18}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Insurer 完全ガイド (長尺 約12分) */}
    <Composition
      id="InsurerFullGuide"
      component={InsurerFullGuideVideo}
      durationInFrames={900 + 450 * 4 + 1500 * 13}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Agent 完全ガイド (長尺 約11分) */}
    <Composition
      id="AgentFullGuide"
      component={AgentFullGuideVideo}
      durationInFrames={900 + 450 * 4 + 1500 * 11}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Admin オンボーディング V2 — 実画面付き (約29分) */}
    <Composition
      id="AdminOnboardingV2"
      component={AdminOnboardingV2Video}
      durationInFrames={900 + 450 * 6 + 3000 * 16 + 900}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Insurer オンボーディング V2 — 実画面付き (約20分) */}
    <Composition
      id="InsurerOnboardingV2"
      component={InsurerOnboardingV2Video}
      durationInFrames={900 + 450 * 4 + 3000 * 11 + 900}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />

    {/* Agent オンボーディング V2 — 実画面付き (約17分) */}
    <Composition
      id="AgentOnboardingV2"
      component={AgentOnboardingV2Video}
      durationInFrames={900 + 450 * 4 + 3000 * 9 + 900}
      fps={FPS} width={W} height={H}
      defaultProps={{}}
    />
  </>
);

registerRoot(RemotionRoot);
