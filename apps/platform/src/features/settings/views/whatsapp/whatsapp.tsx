import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import WhatsAppConfig from "../widget/components/whatsapp-config";
import PreviewCard from "./components/preview-card";

const WhatsAppChannelView = () => {
  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="WhatsApp"
          description="Connect the WhatsApp number Customers use to reach you."
        />

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_26rem]">
          <WhatsAppConfig />
          <PreviewCard />
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default WhatsAppChannelView;
