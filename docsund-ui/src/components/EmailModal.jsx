import React from 'react'
import { observer } from 'mobx-react'
import { Modal } from 'antd'
import appStore from '../stores/AppStore'
import EmailListView from './EmailListView'
import EmailDetailView from './EmailDetailView'

@observer
export default class EmailModal extends React.Component {
  onOk = () => {
    appStore.toggleModal('email')
    appStore.setEmailModalView('list')
  }

  getColumnConfig() {
    return [
      {
        key: 'from',
        render: (text, record) => record.properties.from
      },
      {
        key: 'content',
        render: (text, record) => (
          <EmailContentPreview
            subject={record.properties.subject}
            body={record.properties.body}
          />
        )
      },
      {
        key: 'date',
        render: (text, record) => formatDate(record.properties.date)
      },
    ]
  }

  render() {
    return (
      <Modal
        visible={appStore.modalVisibility.email}
        onCancel={this.onOk}
        onOk={this.onOk}
        width="75%"
        title="Email Viewer"
      >
        {
          appStore.emailModalView === 'list'
            ? <EmailListView />
            : <EmailDetailView />
        }
      </Modal>
    )
  }
}
