{{- define "lecture.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lecture.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "lecture.labels" -}}
app.kubernetes.io/name: {{ include "lecture.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}

{{- define "lecture.web.name" -}}
{{- printf "%s-web" (include "lecture.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lecture.api.name" -}}
{{- printf "%s-api" (include "lecture.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lecture.assets.ratelimit.name" -}}
{{- printf "%s-assets-ratelimit" (include "lecture.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lecture.assets.inflight.name" -}}
{{- printf "%s-assets-inflight" (include "lecture.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lecture.assets.ratelimit.ref" -}}
{{- printf "%s-%s@kubernetescrd" .Release.Namespace (include "lecture.assets.ratelimit.name" .) -}}
{{- end -}}

{{- define "lecture.assets.inflight.ref" -}}
{{- printf "%s-%s@kubernetescrd" .Release.Namespace (include "lecture.assets.inflight.name" .) -}}
{{- end -}}
