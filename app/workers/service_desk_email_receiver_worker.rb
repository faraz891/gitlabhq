# frozen_string_literal: true

class ServiceDeskEmailReceiverWorker < EmailReceiverWorker # rubocop:disable Scalability/IdempotentWorker
  include ApplicationWorker

  sidekiq_options retry: 3

  def perform(raw)
    return unless ::Gitlab::ServiceDeskEmail.enabled?

    begin
      Gitlab::Email::ServiceDeskReceiver.new(raw).execute
    rescue StandardError => e
      handle_failure(raw, e)
    end
  end
end
