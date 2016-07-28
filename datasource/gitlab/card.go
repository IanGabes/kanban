package gitlab

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"gitlab.com/leanlabsio/kanban/models"
	"gitlab.com/leanlabsio/kanban/modules/gitlab"
)

var (
	regTodo = regexp.MustCompile(`[-\*]{1}\s(?P<checked>\[.\])(?P<body>.*)`)
	regProp = regexp.MustCompile(`<!--\s@KB:(.*?)\s-->`)
)

// ListCards returns list card
func (ds GitLabDataSource) ListCards(group_id string, board_id string) ([]*models.Card, error) {
	var b []*models.Card
	op := &gitlab.IssueListOptions{
		State: "opened",
	}
	op.Page = "1"
	op.PerPage = "200"

	r, err := ds.client.ListIssues(group_id, board_id, op)

	if err != nil {
		return nil, err
	}

	for _, d := range r {
		b = append(b, mapCardFromGitlab(d))
	}

	return b, nil
}

// CreateCard create new card on board
func (ds GitLabDataSource) CreateCard(form *models.CardRequest) (*models.Card, int, error) {
	var cr *models.Card
	var code int
	r, res, err := ds.client.CreateIssue(strconv.FormatInt(form.ProjectId, 10), mapCardRequestToGitlab(form))
	if err != nil {
		return nil, res.StatusCode, err
	}

	cr = mapCardFromGitlab(r)

	return cr, code, nil
}

// UpdateCard updates existing card on board
func (ds GitLabDataSource) UpdateCard(form *models.CardRequest) (*models.Card, int, error) {
	var cr *models.Card
	var code int
	r, res, err := ds.client.UpdateIssue(
		strconv.FormatInt(form.ProjectId, 10),
		strconv.FormatInt(form.CardId, 10),
		mapCardRequestToGitlab(form),
	)
	if err != nil {
		return nil, res.StatusCode, err
	}

	cr = mapCardFromGitlab(r)

	return cr, code, nil
}

// DeleteCard removes card from board
func (ds GitLabDataSource) DeleteCard(form *models.CardRequest) (*models.Card, int, error) {
	var cr *models.Card
	var code int
	foru := mapCardRequestToGitlab(form)
	foru.StateEvent = "close"
	r, res, err := ds.client.UpdateIssue(
		strconv.FormatInt(form.ProjectId, 10),
		strconv.FormatInt(form.CardId, 10),
		foru,
	)
	if err != nil {
		return nil, res.StatusCode, err
	}

	cr = mapCardFromGitlab(r)

	return cr, code, nil
}

// mapCardRequestToGitlab transforms card to gitlab issue request
func mapCardRequestToGitlab(c *models.CardRequest) *gitlab.IssueRequest {
	return &gitlab.IssueRequest{
		Title:       c.Title,
		Description: mapCardDescriptionToGitlab(c.Description, c.Todo, c.Properties),
		AssigneeId:  c.AssigneeId,
		MilestoneId: c.MilestoneId,
		Labels:      c.Labels,
	}
}

// mapCardDescriptionToGitlab Transforms card description to gitlab description
func mapCardDescriptionToGitlab(desc string, t []*models.Todo, p *models.Properties) string {
	var d string
	var chek string
	d = strings.TrimSpace(desc)
	for _, v := range t {
		if v.Checked {
			chek = "x"
		} else {
			chek = " "
		}
		d = fmt.Sprintf("%s\n- [%s] %s", d, chek, v.Body)
	}

	pr, err := json.Marshal(p)

	if err == nil {
		d = fmt.Sprintf("%s\n\n<!-- @KB:%s -->", strings.TrimSpace(d), string(pr))
	}

	return strings.TrimSpace(d)
}

// mapCardFromGitlab mapped gitlab issue to kanban card
func mapCardFromGitlab(c *gitlab.Issue) *models.Card {
	return &models.Card{
		Id:          c.Id,
		Iid:         c.Iid,
		Title:       c.Title,
		State:       c.State,
		Assignee:    mapUserFromGitlab(c.Assignee),
		Author:      mapUserFromGitlab(c.Author),
		Description: mapCardDescriptionFromGitlab(c.Description),
		Milestone:   mapMilestoneFromGitlab(c.Milestone),
		Labels:      removeDuplicates(c.Labels),
		ProjectId:   c.ProjectId,
		Properties:  mapCardPropertiesFromGitlab(c.Description),
		Todo:        mapCardTodoFromGitlab(c.Description),
	}
}

// removeDuplicates removed duplicates
func removeDuplicates(xs *[]string) *[]string {
	found := make(map[string]bool)
	j := 0
	for i, x := range *xs {
		if !found[x] {
			found[x] = true
			(*xs)[j] = (*xs)[i]
			j++
		}
	}
	*xs = (*xs)[:j]

	return xs
}

// mapCardTodoFromGitlab tranforms gitlab todo to kanban todo
func mapCardTodoFromGitlab(d string) []*models.Todo {
	var i []*models.Todo
	m := regTodo.MatchString(d)

	if m {
		n := regTodo.SubexpNames()
		res := regTodo.FindAllStringSubmatch(d, -1)

		for _, r1 := range res {
			t := &models.Todo{}
			for i, r2 := range r1 {
				switch n[i] {
				case "checked":
					if r2 == "[x]" {
						t.Checked = true
					} else {
						t.Checked = false
					}
				case "body":
					t.Body = r2
				}
			}

			i = append(i, t)
		}
	} else {
		i = make([]*models.Todo, 0)
	}

	return i
}

// mapCardDescriptionFromGitlab clears gitlab description to card description
func mapCardDescriptionFromGitlab(d string) string {
	var r string
	r = regTodo.ReplaceAllString(d, "")
	r = regProp.ReplaceAllString(r, "")
	return strings.TrimSpace(r)
}

// mapCardPropertiesFromGitlab transforms gitlab description to card properties
func mapCardPropertiesFromGitlab(d string) *models.Properties {
	m := regProp.MatchString(d)
	var p models.Properties

	if m {
		an := regProp.FindStringSubmatch(d)
		json.Unmarshal([]byte(an[1]), &p)
	}

	return &p
}
