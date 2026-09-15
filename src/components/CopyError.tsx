import { X } from "lucide-react";
import { useBoardify } from "../store";
import { useT } from "../i18n";

export function CopyError() {
  const error = useBoardify((s) => s.copyError);
  const { t } = useT();
  if (!error) return null;
  return (
    <div className="glass gpu copy-error" role="alert">
      <span>{t("copy.failed")}</span>
      <button type="button" title={t("action.close")} aria-label={t("action.close")}
        onClick={() => useBoardify.setState({ copyError: null })}><X size={15} /></button>
    </div>
  );
}
