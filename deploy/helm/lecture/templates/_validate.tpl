{{- /*
Validate required values early (fail fast).
*/ -}}

{{- $hasMinioCreds := or .Values.api.minio.existingSecret (and .Values.api.minio.accessKeyId .Values.api.minio.secretAccessKey) -}}
{{- if not $hasMinioCreds -}}
{{- fail "api.minio.existingSecret OR api.minio.accessKeyId+api.minio.secretAccessKey must be set" -}}
{{- end -}}

{{- if not .Values.api.minio.endpoint -}}
{{- fail "api.minio.endpoint is required" -}}
{{- end -}}

{{- if or (not .Values.web.image.repository) (not .Values.web.image.tag) -}}
{{- fail "web.image.repository and web.image.tag are required" -}}
{{- end -}}

{{- if or (not .Values.api.image.repository) (not .Values.api.image.tag) -}}
{{- fail "api.image.repository and api.image.tag are required" -}}
{{- end -}}

{{- if and .Values.ingress.enabled (not .Values.ingress.hosts) -}}
{{- fail "ingress.hosts must be set when ingress.enabled=true" -}}
{{- end -}}

{{- if and .Values.ingress.enabled .Values.ingress.certManager.enabled (not .Values.ingress.certManager.clusterIssuer) -}}
{{- fail "ingress.certManager.clusterIssuer must be set when ingress.certManager.enabled=true" -}}
{{- end -}}
