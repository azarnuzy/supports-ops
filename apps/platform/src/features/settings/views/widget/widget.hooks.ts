import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  useUpdateWebWidgetConfigMutation,
  useUploadWebWidgetLogoMutation,
  webWidgetConfigQueryOptions,
} from "../../widget-config.hooks";
import {
  buildEmbedSnippet,
  domainPattern,
  domainsAreEqual,
  validateWidgetConfig,
} from "./widget.utils";

export function useWidgetSettingsForm() {
  const config = useQuery(webWidgetConfigQueryOptions);
  const updateConfig = useUpdateWebWidgetConfigMutation();
  const uploadLogo = useUploadWebWidgetLogoMutation();

  const [botName, setBotName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [closingMessage, setClosingMessage] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  const current = config.data?.webWidgetConfig;
  const currentClosingMessage = config.data?.closingMessage ?? "";

  useEffect(() => {
    if (current) {
      setBotName(current.botName);
      setWelcomeMessage(current.welcomeMessage);
      setPrimaryColor(current.primaryColor);
      setAllowedDomains(current.allowedDomains);
      setClosingMessage(currentClosingMessage);
    }
  }, [current, currentClosingMessage]);

  const validationError = useMemo(
    () => validateWidgetConfig(botName, welcomeMessage, primaryColor, closingMessage),
    [botName, welcomeMessage, primaryColor, closingMessage],
  );

  const isDirty =
    !!current &&
    (botName !== current.botName ||
      welcomeMessage !== current.welcomeMessage ||
      primaryColor !== current.primaryColor ||
      closingMessage !== currentClosingMessage ||
      !domainsAreEqual(allowedDomains, current.allowedDomains));

  const embedSnippet = buildEmbedSnippet(current?.widgetKey);

  function addDomain() {
    const normalized = domainDraft.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    if (!domainPattern.test(normalized)) {
      setDomainError("Enter a valid domain, e.g. example.com.");
      return;
    }

    if (allowedDomains.includes(normalized)) {
      setDomainError("That domain is already allowed.");
      return;
    }

    setAllowedDomains((domains) => [...domains, normalized]);
    setDomainDraft("");
    setDomainError(null);
  }

  function removeDomain(domain: string) {
    setAllowedDomains((domains) => domains.filter((existing) => existing !== domain));
  }

  function handleDomainKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addDomain();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validationError) {
      return;
    }

    updateConfig.mutate(
      {
        allowedDomains,
        botName: botName.trim(),
        closingMessage: closingMessage.trim() || null,
        primaryColor,
        welcomeMessage: welcomeMessage.trim(),
      },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to save Web Widget.");
        },
        onSuccess: () => {
          toast.success("Web Widget saved.");
        },
      },
    );
  }

  function handleReset() {
    if (!current) {
      return;
    }

    setBotName(current.botName);
    setWelcomeMessage(current.welcomeMessage);
    setPrimaryColor(current.primaryColor);
    setAllowedDomains(current.allowedDomains);
    setClosingMessage(currentClosingMessage);
    setDomainDraft("");
    setDomainError(null);
  }

  function handleLogoUpload(file: File) {
    uploadLogo.mutate(file, {
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Failed to upload logo.");
      },
      onSuccess: () => {
        toast.success("Logo uploaded.");
      },
    });
  }

  function handleLogoRemove() {
    if (!current) {
      return;
    }

    updateConfig.mutate(
      {
        allowedDomains: current.allowedDomains,
        botName: current.botName,
        closingMessage: currentClosingMessage || null,
        logoKey: null,
        primaryColor: current.primaryColor,
        welcomeMessage: current.welcomeMessage,
      },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to remove logo.");
        },
        onSuccess: () => {
          toast.success("Logo removed.");
        },
      },
    );
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      toast.success("Embed snippet copied.");
    } catch {
      toast.error("Failed to copy embed snippet.");
    }
  }

  return {
    addDomain,
    allowedDomains,
    botName,
    closingMessage,
    config,
    copySnippet,
    current,
    domainDraft,
    domainError,
    embedSnippet,
    handleDomainKeyDown,
    handleLogoRemove,
    handleLogoUpload,
    handleReset,
    handleSubmit,
    isDirty,
    primaryColor,
    removeDomain,
    setBotName,
    setClosingMessage,
    setDomainDraft,
    setDomainError,
    setPrimaryColor,
    setWelcomeMessage,
    updateConfig,
    uploadLogo,
    validationError,
    welcomeMessage,
  };
}
