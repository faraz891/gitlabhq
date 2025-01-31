# frozen_string_literal: true

module Gitlab
  module Ci
    module Pipeline
      module Chain
        module Validate
          class External < Chain::Base
            include Chain::Helpers

            InvalidResponseCode = Class.new(StandardError)

            DEFAULT_VALIDATION_REQUEST_TIMEOUT = 5
            ACCEPTED_STATUS = 200
            DOT_COM_REJECTED_STATUS = 406
            GENERAL_REJECTED_STATUS = (400..499).freeze

            def perform!
              return unless enabled?

              pipeline_authorized = validate_external

              log_message = pipeline_authorized ? 'authorized' : 'not authorized'
              Gitlab::AppLogger.info(message: "Pipeline #{log_message}", project_id: project.id, user_id: current_user.id)

              error('External validation failed', drop_reason: :external_validation_failure) unless pipeline_authorized
            end

            def break?
              pipeline.errors.any?
            end

            private

            def enabled?
              return true unless Gitlab.com?

              ::Feature.enabled?(:ci_external_validation_service, project, default_enabled: :yaml)
            end

            def validate_external
              return true unless validation_service_url

              # 200 - accepted
              # 406 - not accepted on GitLab.com
              # 4XX - not accepted for other installations
              # everything else - accepted and logged
              response_code = validate_service_request.code
              case response_code
              when ACCEPTED_STATUS
                true
              when rejected_status
                false
              else
                raise InvalidResponseCode, "Unsupported response code received from Validation Service: #{response_code}"
              end
            rescue StandardError => ex
              Gitlab::ErrorTracking.track_exception(ex, project_id: project.id)

              true
            end

            def rejected_status
              if Gitlab.com?
                DOT_COM_REJECTED_STATUS
              else
                GENERAL_REJECTED_STATUS
              end
            end

            def validate_service_request
              headers = {
                'X-Gitlab-Correlation-id' => Labkit::Correlation::CorrelationId.current_id,
                'X-Gitlab-Token' => validation_service_token
              }.compact

              Gitlab::HTTP.post(
                validation_service_url, timeout: validation_service_timeout,
                headers: headers,
                body: validation_service_payload.to_json
              )
            end

            def validation_service_timeout
              timeout = Gitlab::CurrentSettings.external_pipeline_validation_service_timeout || ENV['EXTERNAL_VALIDATION_SERVICE_TIMEOUT'].to_i
              return timeout if timeout > 0

              DEFAULT_VALIDATION_REQUEST_TIMEOUT
            end

            def validation_service_url
              Gitlab::CurrentSettings.external_pipeline_validation_service_url || ENV['EXTERNAL_VALIDATION_SERVICE_URL']
            end

            def validation_service_token
              Gitlab::CurrentSettings.external_pipeline_validation_service_token || ENV['EXTERNAL_VALIDATION_SERVICE_TOKEN']
            end

            def validation_service_payload
              {
                project: {
                  id: project.id,
                  path: project.full_path,
                  created_at: project.created_at&.iso8601
                },
                user: {
                  id: current_user.id,
                  username: current_user.username,
                  email: current_user.email,
                  created_at: current_user.created_at&.iso8601
                },
                pipeline: {
                  sha: pipeline.sha,
                  ref: pipeline.ref,
                  type: pipeline.source
                },
                builds: builds_validation_payload
              }
            end

            def builds_validation_payload
              stages_attributes.flat_map { |stage| stage[:builds] }
                .map(&method(:build_validation_payload))
            end

            def build_validation_payload(build)
              {
                name: build[:name],
                stage: build[:stage],
                image: build.dig(:options, :image, :name),
                services: build.dig(:options, :services)&.map { |service| service[:name] },
                script: [
                  build.dig(:options, :before_script),
                  build.dig(:options, :script),
                  build.dig(:options, :after_script)
                ].flatten.compact
              }
            end

            def stages_attributes
              command.yaml_processor_result.stages_attributes
            end
          end
        end
      end
    end
  end
end

Gitlab::Ci::Pipeline::Chain::Validate::External.prepend_if_ee('EE::Gitlab::Ci::Pipeline::Chain::Validate::External')
