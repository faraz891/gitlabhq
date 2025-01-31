# frozen_string_literal: true

module BoardIssueFilterable
  extend ActiveSupport::Concern

  private

  def issue_filters(args)
    filters = args.to_h

    set_filter_values(filters)

    if filters[:not]
      set_filter_values(filters[:not])
    end

    filters
  end

  def set_filter_values(filters)
    filter_by_assignee(filters)
  end

  def filter_by_assignee(filters)
    if filters[:assignee_username] && filters[:assignee_wildcard_id]
      raise ::Gitlab::Graphql::Errors::ArgumentError, 'Incompatible arguments: assigneeUsername, assigneeWildcardId.'
    end

    if filters[:assignee_wildcard_id]
      filters[:assignee_id] = filters.delete(:assignee_wildcard_id)
    end
  end
end

::BoardIssueFilterable.prepend_if_ee('::EE::Resolvers::BoardIssueFilterable')
