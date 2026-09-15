import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import WhatsAppConfig from "../widget/components/whatsapp-config";

const WhatsAppChannelView = () => {
  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="WhatsApp"
          description="Connect the WhatsApp number Customers use to reach you."
        />

        <WhatsAppConfig />
      </section>
    </PlatformAppShell>
  );
};

export default WhatsAppChannelView;
