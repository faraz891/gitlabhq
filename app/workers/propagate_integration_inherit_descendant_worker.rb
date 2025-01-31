# frozen_string_literal: true

class PropagateIntegrationInheritDescendantWorker
  include ApplicationWorker

  sidekiq_options retry: 3

  feature_category :integrations
  tags :exclude_from_kubernetes
  idempotent!

  # rubocop: disable CodeReuse/ActiveRecord
  def perform(integration_id, min_id, max_id)
    integration = Service.find_by_id(integration_id)
    return unless integration

    batch = Service.inherited_descendants_from_self_or_ancestors_from(integration).where(id: min_id..max_id)

    BulkUpdateIntegrationService.new(integration, batch).execute
  end
  # rubocop: enable CodeReuse/ActiveRecord
end
