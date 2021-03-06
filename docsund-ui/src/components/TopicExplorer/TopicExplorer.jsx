import React, { Component } from "react"
import {
  Row, Col, Button, Slider, Alert, Spin
} from "antd"
import topicExplorer from "./topic-explorer"
import { fetchJSON } from "../../utils"
import appStore from "../../stores/AppStore"


export default class TopicExplorer extends Component {
  // we hard-code the minimum number of topics, but we'll fetch the maximum from the API later...
  static minTopicNum = 3

  constructor(props) {
    super(props)
    if (TopicExplorer.maxTopicNum === undefined) {
      try {
        TopicExplorer.maxTopicNum = topicExplorer.getMaxNumTopics()
        this.state = {
          loading: false,
          numTopics: topicExplorer.getOptimalNumTopics(),
          selectedTopic: null
        }
      } catch (err) {
        console.error(err)
        TopicExplorer.maxTopicNum = null
      }
    }

    this.onDisplayTopicDocuments = this.onDisplayTopicDocuments.bind(this)
  }

  componentDidMount() {
    topicExplorer.createWordCloud()
    this.renderTopicViz()
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.numTopics !== this.state.numTopics) {
      this.renderTopicViz()
    }
  }

  onTopicNumberChange(numTopics) {
    this.setState({ numTopics, selectedTopic: null })
  }

  onTopicSelect(selectedTopic) {
    this.setState({ selectedTopic })
  }

  async renderTopicViz() {
    this.setState({ loading: true })
    const topicData = await topicExplorer.getTopicsData(this.state.numTopics)

    topicExplorer.plotTopicData(topicData, this.onTopicSelect.bind(this))
    topicExplorer.plotWordCloud()
    this.setState({ loading: false })
  }

  async onDisplayTopicDocuments() {
    const data = await fetchJSON(`${TOPIC_API_URL}/TM/topics/${this.state.selectedTopic}/documents?numTopics=${this.state.numTopics}`)

    const { docIDs } = data
    appStore.toggleModal("topicSample")
    appStore.setEmailModalView("list")
    await appStore.fetchEmailsFromIDs(docIDs, 250)
  }

  render() {
    if (TopicExplorer.maxTopicNum === null) {
      return <Alert message="Error" type="error" />
    }
    return (
      <div className="svg-container" id="topic-explorer">
        <Spin spinning={this.state.loading} tip="loading..." size="large">
          <Row>
            <Col span={12} style={{ padding: "15px" }}>
              <svg id="word-cloud" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet" width="100%" />
            </Col>
            <Col span={12} style={{ padding: "15px" }}>
              <svg id="topic-plot" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet" width="100%" />
            </Col>
          </Row>
        </Spin>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "inline-block", width: "80px" }}>
            <label htmlFor="topic-num-slider">
              # of topics:
            </label>
          </div>
          <div style={{ display: "inline-block", width: "calc(100% - 100px)" }}>
            <Slider
              id="topic-num-slider"
              defaultValue={this.state.numTopics}
              tooltipVisible
              onAfterChange={this.onTopicNumberChange.bind(this)}
              min={TopicExplorer.minTopicNum}
              max={TopicExplorer.maxTopicNum}
              getTooltipPopupContainer={() => document.getElementById("topic-explorer-tab")}
            />
          </div>
        </div>
        <Row>
          <Col span={3}>
            <Button type="primary" onClick={this.onDisplayTopicDocuments} disabled={this.state.selectedTopic === null}>
              {this.state.selectedTopic !== null
                ? `Get emails from topic ${this.state.selectedTopic} (of ${this.state.numTopics})`
                : "Select a topic"
              }
            </Button>
          </Col>
        </Row>
      </div>
    )
  }
}
