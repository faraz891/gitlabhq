# frozen_string_literal: true

module Banzai
  module Filter
    module References
      # HTML filter that replaces snippet references with links. References to
      # snippets that do not exist are ignored.
      #
      # This filter supports cross-project references.
      class SnippetReferenceFilter < AbstractReferenceFilter
        self.reference_type = :snippet
        self.object_class   = Snippet

        def find_object(project, id)
          return unless project.is_a?(Project)

          project.snippets.find_by(id: id)
        end

        def url_for_object(snippet, project)
          h = Gitlab::Routing.url_helpers
          h.project_snippet_url(project, snippet,
                                          only_path: context[:only_path])
        end
      end
    end
  end
end
