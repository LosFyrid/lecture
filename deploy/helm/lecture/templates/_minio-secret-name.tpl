{{- define "lecture.minioSecretName" -}}
{{- if .Values.api.minio.existingSecret -}}
{{- .Values.api.minio.existingSecret -}}
{{- else -}}
{{- printf "%s-minio" (include "lecture.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

