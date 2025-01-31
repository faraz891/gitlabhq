import { GlAlert, GlButton, GlLoadingIcon } from '@gitlab/ui';
import { mount } from '@vue/test-utils';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { extendedWrapper } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import WikiForm from '~/pages/shared/wikis/components/wiki_form.vue';
import MarkdownField from '~/vue_shared/components/markdown/field.vue';

describe('WikiForm', () => {
  let wrapper;

  const findForm = () => wrapper.find('form');
  const findTitle = () => wrapper.find('#wiki_title');
  const findFormat = () => wrapper.find('#wiki_format');
  const findContent = () => wrapper.find('#wiki_content');
  const findMessage = () => wrapper.find('#wiki_message');
  const findSubmitButton = () => wrapper.findByTestId('wiki-submit-button');
  const findCancelButton = () => wrapper.findByRole('link', { name: 'Cancel' });
  const findUseNewEditorButton = () => wrapper.findByRole('button', { name: 'Use new editor' });
  const findTitleHelpLink = () => wrapper.findByRole('link', { name: 'More Information.' });
  const findMarkdownHelpLink = () => wrapper.findByTestId('wiki-markdown-help-link');

  const setFormat = (value) => {
    const format = findFormat();
    format.find(`option[value=${value}]`).setSelected();
    format.element.dispatchEvent(new Event('change'));
  };

  const triggerFormSubmit = () => findForm().element.dispatchEvent(new Event('submit'));

  const dispatchBeforeUnload = () => {
    const e = new Event('beforeunload');
    jest.spyOn(e, 'preventDefault');
    window.dispatchEvent(e);
    return e;
  };

  const pageInfoNew = {
    persisted: false,
    uploadsPath: '/project/path/-/wikis/attachments',
    wikiPath: '/project/path/-/wikis',
    helpPath: '/help/user/project/wiki/index',
    markdownHelpPath: '/help/user/markdown',
    markdownPreviewPath: '/project/path/-/wikis/.md/preview-markdown',
    createPath: '/project/path/-/wikis/new',
  };

  const pageInfoPersisted = {
    ...pageInfoNew,
    persisted: true,

    title: 'My page',
    content: 'My page content',
    format: 'markdown',
    path: '/project/path/-/wikis/home',
  };

  function createWrapper(
    persisted = false,
    { pageInfo, glFeatures } = { glFeatures: { wikiContentEditor: false } },
  ) {
    wrapper = extendedWrapper(
      mount(
        WikiForm,
        {
          provide: {
            formatOptions: {
              Markdown: 'markdown',
              RDoc: 'rdoc',
              AsciiDoc: 'asciidoc',
              Org: 'org',
            },
            pageInfo: {
              ...(persisted ? pageInfoPersisted : pageInfoNew),
              ...pageInfo,
            },
            glFeatures,
          },
        },
        { attachToDocument: true },
      ),
    );
  }

  afterEach(() => {
    wrapper.destroy();
    wrapper = null;
  });

  it.each`
    title                | persisted | message
    ${'my page'}         | ${false}  | ${'Create my page'}
    ${'my-page'}         | ${false}  | ${'Create my page'}
    ${'somedir/my-page'} | ${false}  | ${'Create somedir/my page'}
    ${'my-page'}         | ${true}   | ${'Update my page'}
  `(
    'updates the commit message to $message when title is $title and persisted=$persisted',
    async ({ title, message, persisted }) => {
      createWrapper(persisted);

      findTitle().setValue(title);

      await wrapper.vm.$nextTick();

      expect(findMessage().element.value).toBe(message);
    },
  );

  it('sets the commit message to "Update My page" when the page first loads when persisted', async () => {
    createWrapper(true);

    await wrapper.vm.$nextTick();

    expect(findMessage().element.value).toBe('Update My page');
  });

  it.each`
    value         | text
    ${'markdown'} | ${'[Link Title](page-slug)'}
    ${'rdoc'}     | ${'{Link title}[link:page-slug]'}
    ${'asciidoc'} | ${'link:page-slug[Link title]'}
    ${'org'}      | ${'[[page-slug]]'}
  `('updates the link help message when format=$value is selected', async ({ value, text }) => {
    createWrapper();

    setFormat(value);

    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain(text);
  });

  it('starts with no unload warning', async () => {
    createWrapper();

    await wrapper.vm.$nextTick();

    const e = dispatchBeforeUnload();
    expect(typeof e.returnValue).not.toBe('string');
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it.each`
    persisted | titleHelpText                                                                                              | titleHelpLink
    ${true}   | ${'You can move this page by adding the path to the beginning of the title.'}                              | ${'/help/user/project/wiki/index#move-a-wiki-page'}
    ${false}  | ${'You can specify the full path for the new file. We will automatically create any missing directories.'} | ${'/help/user/project/wiki/index#create-a-new-wiki-page'}
  `(
    'shows appropriate title help text and help link for when persisted=$persisted',
    async ({ persisted, titleHelpLink, titleHelpText }) => {
      createWrapper(persisted);

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain(titleHelpText);
      expect(findTitleHelpLink().attributes().href).toEqual(titleHelpLink);
    },
  );

  it('shows correct link for wiki specific markdown docs', async () => {
    createWrapper();

    await wrapper.vm.$nextTick();

    expect(findMarkdownHelpLink().attributes().href).toEqual(
      '/help/user/markdown#wiki-specific-markdown',
    );
  });

  describe('when wiki content is updated', () => {
    beforeEach(() => {
      createWrapper();

      const input = findContent();
      input.setValue('Lorem ipsum dolar sit!');
      input.element.dispatchEvent(new Event('input'));

      return wrapper.vm.$nextTick();
    });

    it('sets before unload warning', () => {
      const e = dispatchBeforeUnload();

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('when form submitted, unsets before unload warning', async () => {
      triggerFormSubmit();

      await wrapper.vm.$nextTick();

      const e = dispatchBeforeUnload();
      expect(e.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('submit button state', () => {
    it.each`
      title          | content        | buttonState   | disabledAttr
      ${'something'} | ${'something'} | ${'enabled'}  | ${undefined}
      ${''}          | ${'something'} | ${'disabled'} | ${'disabled'}
      ${'something'} | ${''}          | ${'disabled'} | ${'disabled'}
      ${''}          | ${''}          | ${'disabled'} | ${'disabled'}
      ${'   '}       | ${'   '}       | ${'disabled'} | ${'disabled'}
    `(
      "when title='$title', content='$content', then the button is $buttonState'",
      async ({ title, content, disabledAttr }) => {
        createWrapper();

        findTitle().setValue(title);
        findContent().setValue(content);

        await wrapper.vm.$nextTick();

        expect(findSubmitButton().attributes().disabled).toBe(disabledAttr);
      },
    );

    it.each`
      persisted | buttonLabel
      ${true}   | ${'Save changes'}
      ${false}  | ${'Create page'}
    `('when persisted=$persisted, label is set to $buttonLabel', ({ persisted, buttonLabel }) => {
      createWrapper(persisted);

      expect(findSubmitButton().text()).toBe(buttonLabel);
    });
  });

  describe('cancel button state', () => {
    it.each`
      persisted | redirectLink
      ${false}  | ${'/project/path/-/wikis'}
      ${true}   | ${'/project/path/-/wikis/home'}
    `(
      'when persisted=$persisted, redirects the user to appropriate path',
      ({ persisted, redirectLink }) => {
        createWrapper(persisted);

        expect(findCancelButton().attributes().href).toEqual(redirectLink);
      },
    );
  });

  describe('when feature flag wikiContentEditor is enabled', () => {
    beforeEach(() => {
      createWrapper(true, { glFeatures: { wikiContentEditor: true } });
    });

    it.each`
      format        | buttonExists
      ${'markdown'} | ${true}
      ${'rdoc'}     | ${false}
    `(
      'switch to new editor button exists: $buttonExists if format is $format',
      async ({ format, buttonExists }) => {
        setFormat(format);

        await wrapper.vm.$nextTick();

        expect(findUseNewEditorButton().exists()).toBe(buttonExists);
      },
    );

    const assertOldEditorIsVisible = () => {
      expect(wrapper.findComponent(ContentEditor).exists()).toBe(false);
      expect(wrapper.findComponent(MarkdownField).exists()).toBe(true);
      expect(wrapper.findComponent(GlAlert).exists()).toBe(false);
    };

    it('shows old editor by default', assertOldEditorIsVisible);

    describe('switch format to rdoc', () => {
      beforeEach(async () => {
        setFormat('rdoc');

        await wrapper.vm.$nextTick();
      });

      it('continues to show the old editor', assertOldEditorIsVisible);

      describe('switch format back to markdown', () => {
        beforeEach(async () => {
          setFormat('rdoc');

          await wrapper.vm.$nextTick();
        });

        it(
          'still shows the old editor and does not automatically switch to the content editor ',
          assertOldEditorIsVisible,
        );
      });
    });

    describe('clicking "use new editor"', () => {
      let mock;

      beforeEach(async () => {
        mock = new MockAdapter(axios);
        mock.onPost(/preview-markdown/).reply(200, { body: '<p>hello <strong>world</strong></p>' });

        findUseNewEditorButton().trigger('click');

        await wrapper.vm.$nextTick();
      });

      afterEach(() => {
        mock.restore();
      });

      it('shows a loading indicator for the rich text editor', () => {
        expect(wrapper.findComponent(GlLoadingIcon).exists()).toBe(true);
      });

      it('shows a warning alert that the rich text editor is in beta', () => {
        expect(wrapper.findComponent(GlAlert).text()).toContain(
          "You are editing this page with Content Editor. This editor is in beta and may not display the page's contents properly.",
        );
      });

      it('shows the rich text editor when loading finishes', async () => {
        // wait for content editor to load
        await waitForPromises();

        expect(wrapper.findComponent(GlLoadingIcon).exists()).toBe(false);
        expect(wrapper.findComponent(ContentEditor).exists()).toBe(true);
      });

      it('disables the format dropdown', () => {
        expect(findFormat().element.getAttribute('disabled')).toBeDefined();
      });

      describe('when wiki content is updated', () => {
        beforeEach(async () => {
          // wait for content editor to load
          await waitForPromises();

          wrapper.vm.contentEditor.tiptapEditor.commands.setContent(
            '<p>hello __world__ from content editor</p>',
            true,
          );

          await waitForPromises();

          return wrapper.vm.$nextTick();
        });

        it('sets before unload warning', () => {
          const e = dispatchBeforeUnload();
          expect(e.preventDefault).toHaveBeenCalledTimes(1);
        });

        it('unsets before unload warning on form submit', async () => {
          triggerFormSubmit();

          await wrapper.vm.$nextTick();

          const e = dispatchBeforeUnload();
          expect(e.preventDefault).not.toHaveBeenCalled();
        });
      });

      it('updates content from content editor on form submit', async () => {
        // old value
        expect(findContent().element.value).toBe('My page content');

        // wait for content editor to load
        await waitForPromises();

        triggerFormSubmit();

        await wrapper.vm.$nextTick();

        expect(findContent().element.value).toBe('hello **world**');
      });

      describe('clicking "switch to old editor"', () => {
        beforeEach(async () => {
          // wait for content editor to load
          await waitForPromises();

          wrapper.vm.contentEditor.tiptapEditor.commands.setContent(
            '<p>hello __world__ from content editor</p>',
            true,
          );
          wrapper.findComponent(GlAlert).findComponent(GlButton).trigger('click');

          await wrapper.vm.$nextTick();
        });

        it('switches to old editor', () => {
          expect(wrapper.findComponent(ContentEditor).exists()).toBe(false);
          expect(wrapper.findComponent(MarkdownField).exists()).toBe(true);
        });

        it('does not show a warning alert about content editor', () => {
          expect(wrapper.findComponent(GlAlert).exists()).toBe(false);
        });

        it('the old editor retains its old value and does not use the content from the content editor', () => {
          expect(findContent().element.value).toBe('My page content');
        });
      });
    });
  });
});
